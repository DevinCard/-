document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadUpcomingPurchases();
        await loadPreviousPurchases();
        await initializeProjectedBudgetGraph(12);

        // Add range button listeners
        const rangeButtons = document.querySelectorAll('.range-btn');
        rangeButtons.forEach(button => {
            button.addEventListener('click', async () => {
                // Update active state
                rangeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Update graph with new range
                const months = parseInt(button.dataset.months);
                await initializeProjectedBudgetGraph(months);
            });
        });

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

async function initializeProjectedBudgetGraph(months = 12) {
    const chartElement = document.getElementById('projectedBudgetChart');
    if (!chartElement) return;

    try {
        const balanceData = await api.getBalance();
        const transactions = await api.getTransactions();
        const recurringTransactions = transactions.filter(t => t.recurring && t.recurring !== 'one-time');

        const projectionData = calculateBalanceProjection(balanceData.balance, recurringTransactions, months);

        const options = {
            series: [{
                name: 'Projected Balance',
                data: projectionData.balances
            }],
            chart: {
                type: 'area',
                height: '100%',
                width: '100%',
                fontFamily: 'Poppins, sans-serif',
                toolbar: {
                    show: true,
                    tools: {
                        download: false,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                    }
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800,
                    animateGradually: {
                        enabled: true,
                        delay: 150
                    },
                    dynamicAnimation: {
                        enabled: true,
                        speed: 350
                    }
                }
            },
            dataLabels: {
                enabled: false
            },
            xaxis: {
                categories: projectionData.labels,
                labels: {
                    style: {
                        colors: '#666',
                        fontSize: '12px'
                    }
                },
                axisBorder: {
                    show: false
                },
                axisTicks: {
                    show: false
                }
            },
            yaxis: {
                labels: {
                    formatter: function(value) {
                        return '$' + value.toFixed(0);
                    },
                    style: {
                        colors: '#666',
                        fontSize: '12px'
                    }
                }
            },
            stroke: {
                curve: 'smooth',
                width: 3,
                colors: projectionData.balances.map(balance => balance >= 0 ? '#78a864' : '#ff6b6b')
            },
            colors: projectionData.balances.map(balance => balance >= 0 ? '#78a864' : '#ff6b6b'),
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.7,
                    opacityTo: 0.2,
                    stops: [0, 90, 100],
                    colorStops: projectionData.balances.map((balance, index) => ([
                        {
                            offset: 0,
                            color: balance >= 0 ? '#78a864' : '#ff6b6b',
                            opacity: 0.7
                        },
                        {
                            offset: 100,
                            color: balance >= 0 ? '#78a864' : '#ff6b6b',
                            opacity: 0.2
                        }
                    ]))
                }
            },
            markers: {
                size: 4,
                colors: projectionData.balances.map(balance => balance >= 0 ? '#78a864' : '#ff6b6b'),
                strokeColors: '#fff',
                strokeWidth: 2,
                hover: {
                    size: 7,
                }
            },
            tooltip: {
                theme: 'light',
                y: {
                    formatter: function(value) {
                        return '$' + value.toFixed(2);
                    }
                },
                style: {
                    fontSize: '12px',
                    fontFamily: 'Poppins, sans-serif'
                },
                custom: function({ series, seriesIndex, dataPointIndex }) {
                    const value = series[seriesIndex][dataPointIndex];
                    const color = value >= 0 ? '#78a864' : '#ff6b6b';
                    return '<div class="custom-tooltip" style="padding: 8px; border-left: 3px solid ' + color + '">' +
                           '<span style="color: ' + color + '">$' + value.toFixed(2) + '</span>' +
                           '</div>';
                }
            }
        };

        // If there's an existing chart, destroy it
        if (window.projectedBudgetChart) {
            window.projectedBudgetChart.destroy();
        }

        // Create new chart and store reference
        window.projectedBudgetChart = new ApexCharts(chartElement, options);
        window.projectedBudgetChart.render();

        // Add window resize handler
        window.addEventListener('resize', () => {
            window.projectedBudgetChart.updateOptions({
                chart: {
                    height: '100%',
                    width: '100%'
                }
            });
        });

    } catch (error) {
        console.error('Error initializing graph:', error);
    }
}

function calculateBalanceProjection(currentBalance, recurringTransactions, months = 12) {
    const labels = [];
    const balances = [];
    let runningBalance = currentBalance;
    const today = new Date();
    
    // Project for specified number of months
    for (let i = 0; i < months; i++) {
        const date = new Date(today);
        date.setMonth(today.getMonth() + i);
        labels.push(date.toLocaleString('default', { month: 'short', year: '2-digit' }));
        
        // Calculate impact of recurring transactions for this month
        recurringTransactions.forEach(transaction => {
            const amount = transaction.amount;
            let monthlyImpact = 0;

            switch(transaction.recurring) {
                case 'daily':
                    monthlyImpact = amount * 30;
                    break;
                case 'weekly':
                    monthlyImpact = amount * 4;
                    break;
                case 'bi-weekly':
                    monthlyImpact = amount * 2;
                    break;
                case 'monthly':
                    monthlyImpact = amount;
                    break;
                case 'yearly':
                    monthlyImpact = amount / 12;
                    break;
                case 'custom':
                    if (transaction.recurrenceInterval) {
                        const [interval, unit] = transaction.recurrenceInterval.split('-');
                        switch(unit) {
                            case 'days':
                                monthlyImpact = (amount * 30) / parseInt(interval);
                                break;
                            case 'weeks':
                                monthlyImpact = (amount * 4) / parseInt(interval);
                                break;
                            case 'months':
                                monthlyImpact = amount / parseInt(interval);
                                break;
                            case 'years':
                                monthlyImpact = amount / (12 * parseInt(interval));
                                break;
                        }
                    }
                    break;
            }

            if (transaction.type === 'Withdrawal') {
                runningBalance -= monthlyImpact;
            } else {
                runningBalance += monthlyImpact;
            }
        });

        balances.push(runningBalance);
    }

    return { labels, balances };
} 