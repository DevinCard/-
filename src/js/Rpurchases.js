document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadUpcomingPurchases();
        await loadPreviousPurchases();
        initializeProjectedBudgetGraph();
    } catch (error) {
        console.error('Error initializing recurring purchases:', error);
    }
});

async function loadUpcomingPurchases() {
    try {
        const transactions = await api.getTransactions();
        const upcomingContainer = document.querySelector('.upcoming-purchases-container');
        
        if (!upcomingContainer) return;

        // Filter for recurring transactions
        const recurringTransactions = transactions.filter(t => t.recurring && t.recurring !== 'one-time')
            .map(t => ({
                ...t,
                nextOccurrence: calculateNextOccurrence(t)
            }))
            .filter(t => t.nextOccurrence > new Date()) // Only future occurrences
            .sort((a, b) => a.nextOccurrence - b.nextOccurrence);

        upcomingContainer.innerHTML = recurringTransactions.length ? 
            recurringTransactions.map(t => createTransactionElement(t, true)).join('') :
            '<p class="no-data">No upcoming recurring purchases</p>';
    } catch (error) {
        console.error('Error loading upcoming purchases:', error);
    }
}

async function loadPreviousPurchases() {
    try {
        const transactions = await api.getTransactions();
        const previousContainer = document.querySelector('.previous-purchases-container');
        
        if (!previousContainer) return;

        // Filter for completed recurring transactions
        const previousTransactions = transactions
            .filter(t => t.recurring && t.recurring !== 'one-time' && new Date(t.date) <= new Date())
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        previousContainer.innerHTML = previousTransactions.length ?
            previousTransactions.map(t => createTransactionElement(t, false)).join('') :
            '<p class="no-data">No previous recurring purchases</p>';
    } catch (error) {
        console.error('Error loading previous purchases:', error);
    }
}

function calculateNextOccurrence(transaction) {
    const lastDate = new Date(transaction.date);
    const today = new Date();
    let nextDate = new Date(lastDate);

    if (!transaction.recurring) return nextDate;

    const addInterval = (date, interval) => {
        const newDate = new Date(date);
        switch (transaction.recurring) {
            case 'daily':
                newDate.setDate(date.getDate() + 1);
                break;
            case 'weekly':
                newDate.setDate(date.getDate() + 7);
                break;
            case 'bi-weekly':
                newDate.setDate(date.getDate() + 14);
                break;
            case 'monthly':
                newDate.setMonth(date.getMonth() + 1);
                break;
            case 'yearly':
                newDate.setFullYear(date.getFullYear() + 1);
                break;
            case 'custom':
                if (transaction.recurrenceInterval) {
                    const [interval, unit] = transaction.recurrenceInterval.split('-');
                    switch (unit) {
                        case 'days':
                            newDate.setDate(date.getDate() + parseInt(interval));
                            break;
                        case 'weeks':
                            newDate.setDate(date.getDate() + (parseInt(interval) * 7));
                            break;
                        case 'months':
                            newDate.setMonth(date.getMonth() + parseInt(interval));
                            break;
                        case 'years':
                            newDate.setFullYear(date.getFullYear() + parseInt(interval));
                            break;
                    }
                }
                break;
        }
        return newDate;
    };

    while (nextDate <= today) {
        nextDate = addInterval(nextDate);
    }

    return nextDate;
}

function createTransactionElement(transaction, isUpcoming) {
    if (isUpcoming) {
        const today = new Date();
        const nextDate = new Date(transaction.nextOccurrence);
        const daysUntil = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        
        return `
            <div class="transaction-item ${transaction.type.toLowerCase()}">
                <div class="transaction-info">
                    <span class="days-until">${daysUntil} days</span>
                    <span class="transaction-title">${transaction.title}</span>
                    <span class="transaction-amount ${transaction.type.toLowerCase()}-amount">
                        ${transaction.type === 'Withdrawal' ? '-' : '+'}$${transaction.amount.toFixed(2)}
                    </span>
                    <span class="transaction-date">${nextDate.toLocaleDateString()}</span>
                    <span class="transaction-recurring">${formatRecurringText(transaction)}</span>
                </div>
            </div>
        `;
    } else {
        const date = new Date(transaction.date).toLocaleDateString();
        return `
            <div class="transaction-item ${transaction.type.toLowerCase()}">
                <div class="transaction-info">
                    <span class="transaction-title">${transaction.title}</span>
                    <span class="transaction-amount ${transaction.type.toLowerCase()}-amount">
                        ${transaction.type === 'Withdrawal' ? '-' : '+'}$${transaction.amount.toFixed(2)}
                    </span>
                    <span class="transaction-date">${date}</span>
                    <span class="transaction-recurring">${formatRecurringText(transaction)}</span>
                </div>
            </div>
        `;
    }
}

function formatRecurringText(transaction) {
    if (!transaction.recurring) return '';
    
    if (transaction.recurring === 'custom' && transaction.recurrenceInterval) {
        const [interval, unit] = transaction.recurrenceInterval.split('-');
        return `Every ${interval} ${unit}`;
    }
    return transaction.recurring.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join('-');
}

function initializeProjectedBudgetGraph() {
    const ctx = document.getElementById('projectedBudgetChart');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Will be populated with dates
            datasets: [{
                label: 'Projected Balance',
                data: [], // Will be populated with balance projections
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
} 