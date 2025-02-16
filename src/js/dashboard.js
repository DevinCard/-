document.addEventListener("DOMContentLoaded", async () => {
  try {
    const balanceData = await api.getBalance();
    const balance = balanceData.balance;

    const balanceElement = document.querySelector(".balance-amount");
    if (balanceElement) {
      balanceElement.textContent = `$${balance.toFixed(2)}`;
    }

    const transactions = await api.getTransactions();
    
    if (transactions.length > 0) {
      const labels = transactions.map(t => t.date);
      const data = transactions.reduce((acc, t) => {
        const lastBalance = acc.length ? acc[acc.length - 1] : 0;
        const newBalance = t.type === "Deposit" ? lastBalance + t.amount : lastBalance - t.amount;
        acc.push(newBalance);
        return acc;
      }, []);

      const ctx = document.getElementById('balanceChart');
      if (ctx) {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Balance Over Time',
              data: data,
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              fill: true,
            }]
          },
          options: {
            scales: {
              x: {
                type: 'time',
                time: {
                  unit: 'day'
                }
              }
            }
          }
        });
      }
    }

    // Initialize timeframe buttons
    const timeButtons = document.querySelectorAll('.time-btn')
    timeButtons.forEach(button => {
      button.addEventListener('click', async () => {
        // Remove active class from all buttons
        timeButtons.forEach(btn => btn.classList.remove('active'));
        // Add active class to clicked button
        button.classList.add('active');
        // Update display with new timeframe
        await updateCategoryDisplay(button.dataset.timeframe);
      });
    });

    // Initial load with 'day' timeframe
    await updateCategoryDisplay('day');

    // Initialize sorting buttons
    initializeSortingButtons();

  } catch (error) {
    console.error('Error initializing dashboard:', error);
  }
});

async function updateCategoryDisplay(timeframe, sortBy = 'amount') {
  try {
    const transactions = await api.getTransactions();
    console.log('Fetched transactions:', transactions); // Debug log
    const rankings = getCategoryRankings(transactions, timeframe);
    
    // Sort rankings based on selected method
    switch(sortBy) {
      case 'name':
        rankings.sort((a, b) => a.category.localeCompare(b.category));
        break;
      case 'recent':
        // Get most recent transaction date for each category
        const categoryDates = {};
        transactions.forEach(t => {
          if (!categoryDates[t.category] || new Date(t.date) > new Date(categoryDates[t.category])) {
            categoryDates[t.category] = t.date;
          }
        });
        rankings.sort((a, b) => new Date(categoryDates[b.category]) - new Date(categoryDates[a.category]));
        break;
      default: // 'amount'
        rankings.sort((a, b) => b.amount - a.amount);
    }
    
    console.log('Current rankings:', rankings); // Debug log
    
    // Get previous period rankings
    const previousTimeframe = getPreviousPeriod(timeframe);
    const previousRankings = getCategoryRankings(transactions, previousTimeframe);
    
    updateRankings(rankings, previousRankings);
  } catch (error) {
    console.error('Error updating category display:', error);
  }
}

function getPreviousPeriod(timeframe) {
  const now = new Date();
  switch(timeframe) {
    case 'day':
      now.setDate(now.getDate() - 1);
      return 'day';
    case 'week':
      now.setDate(now.getDate() - 7);
      return 'week';
    case 'month':
      now.setMonth(now.getMonth() - 1);
      return 'month';
    case '3month':
      now.setMonth(now.getMonth() - 3);
      return '3month';
    case 'ytd':
      now.setFullYear(now.getFullYear() - 1);
      return 'ytd';
    default:
      return timeframe;
  }
}

function getCategoryRankings(transactions, timeframe) {
  if (!transactions || transactions.length === 0) return [];
  
  const now = new Date();
  const filteredTransactions = transactions.filter(t => {
    const transDate = new Date(t.date);
    switch(timeframe) {
      case 'day':
        return transDate.toDateString() === now.toDateString();
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return transDate >= weekAgo;
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return transDate >= monthStart;
      case '3month':
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        return transDate >= threeMonthsAgo;
      case 'ytd':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return transDate >= yearStart;
      default:
        return true;
    }
  });

  console.log('Filtered transactions:', filteredTransactions);

  const categorySpending = {};
  filteredTransactions.forEach(t => {
    let category = t.category;
    if (category.includes(' ')) {
      category = category.split(' ')[1];
    }
    if (t.type === 'Withdrawal') {
      categorySpending[category] = (categorySpending[category] || 0) + t.amount;
    } else if (t.type === 'Deposit') {
      categorySpending[category] = (categorySpending[category] || 0) + t.amount;
    }
  });

  const rankings = Object.entries(categorySpending)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  console.log('Rankings:', rankings);
  return rankings;
}

function updateRankings(newRankings, oldRankings) {
  const rankingsContainer = document.getElementById('category-rankings');
  if (!rankingsContainer) return;

  rankingsContainer.innerHTML = '';

  if (newRankings.length === 0) {
    rankingsContainer.innerHTML = '<div class="no-data" style="text-align: center; padding: 20px; color: #666;">No transactions in this period</div>';
    return;
  }

  newRankings.forEach((item, index) => {
    const oldIndex = oldRankings.findIndex(r => r.category === item.category);
    let rankChangeValue = oldIndex !== -1 ? oldIndex - index : 0;

    const rankingItem = document.createElement('div');
    rankingItem.className = 'ranking-item';

    rankingItem.innerHTML = `
      <div class="rank-info">
        <span class="rank-number">#${index + 1}</span>
        <span>${item.category}</span>
        <div class="rank-change ${getRankChangeClass(rankChangeValue)}">
          ${getRankChangeHTML(rankChangeValue)}
        </div>
      </div>
      <span class="category-amount">$${item.amount.toFixed(2)}</span>
    `;

    rankingsContainer.appendChild(rankingItem);
  });
}

function getRankChangeClass(change) {
  return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
}

function getRankChangeHTML(change) {
  if (change > 0) return `↑ +${change}`;
  if (change < 0) return `↓ ${change}`;
  return '•';
}

function initializeSortingButtons() {
  const sortingButtons = document.querySelectorAll('.sort-btn');
  sortingButtons.forEach(button => {
    button.addEventListener('click', async () => {
      // Remove active class from all buttons
      sortingButtons.forEach(btn => btn.classList.remove('active'));
      // Add active class to clicked button
      button.classList.add('active');
      
      // Get current timeframe and update display with new sorting
      const timeframe = document.getElementById('timeframe-select').value;
      await updateCategoryDisplay(timeframe, button.dataset.sort);
    });
  });
} 