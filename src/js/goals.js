// Global variables
let currentGoals = [];

function checkAuth() {
    // Check both storage locations for the token
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    
    if (!token) {
        console.log('No authentication token found, redirecting to login');
        window.location.href = '/index.html'; // Redirect to login page
        return false;
    }
    return true;
}

// Initialize everything when the DOM loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    try {
        if (!checkAuth()) {
            console.log('Auth check failed');
            return;
        }
        
        await Promise.all([
            loadCategories(),
            loadGoals()
        ]);
        
        setupEventListeners();
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Setup all event listeners
function setupEventListeners() {
    // New goal form submission
    const newGoalForm = document.getElementById('newGoalForm');
    if (newGoalForm) {
        newGoalForm.addEventListener('submit', handleNewGoalSubmit);
    }

    // Category selection change
    const categorySelect = document.getElementById('goal-category-select');
    if (categorySelect) {
        categorySelect.addEventListener('change', handleCategoryChange);
    }

    // Close buttons for modals
    document.querySelectorAll('.close').forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });
}

// Load and display goals
async function loadGoals() {
    try {
        console.log('Starting to load goals...');
        const goals = await api.getGoals();
        console.log('Fetched goals:', goals);
        
        const goalsContainer = document.querySelector('.goals-container');
        if (!goalsContainer) {
            throw new Error('Goals container not found in DOM');
        }
        
        const scrollContainer = createGoalsContainer();
        
        if (!goals || goals.length === 0) {
            scrollContainer.innerHTML = '<p class="no-goals">No goals yet. Create one to get started!</p>';
            return;
        }
        
        goals.forEach(goal => {
            try {
                const goalCard = createGoalCard(goal);
                scrollContainer.appendChild(goalCard);
                initializeProgressCircle(goalCard, goal);
                console.log('Goal card created:', goal.title);
            } catch (error) {
                console.error('Error creating goal card:', error, goal);
            }
        });

        // Show/hide scroll buttons based on content
        updateScrollButtons();
        
    } catch (error) {
        console.error('Detailed error in loadGoals:', error);
        handleLoadError(error);
    }
}

// Create a goal card element
function createGoalCard(goal) {
    const targetAmount = parseFloat(goal.target_amount);
    const currentAmount = parseFloat(goal.current_amount || 0);
    const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    
    // Extract emoji from category string (assuming format "emoji|name")
    const [emoji] = goal.category.split('|');
    
    const goalCard = document.createElement('div');
    goalCard.className = 'goal-card';
    goalCard.setAttribute('data-goal-id', goal.id);
    
    goalCard.innerHTML = `
        <div class="goal-circle">
            <div class="category-emoji-background">${emoji}</div>
            <svg class="progress-ring" width="120" height="120">
                <circle class="progress-ring-circle-bg" 
                    stroke="#e0e0e0"
                    stroke-width="8"
                    fill="transparent"
                    r="52"
                    cx="60"
                    cy="60"/>
                <circle class="progress-ring-circle" 
                    stroke="#4CAF50"
                    stroke-width="8"
                    fill="transparent"
                    r="52"
                    cx="60"
                    cy="60"/>
            </svg>
            <div class="progress-text-container">
                <div class="percentage">${Math.round(progress)}%</div>
                <div class="amount">$${currentAmount.toFixed(2)} / $${targetAmount.toFixed(2)}</div>
            </div>
        </div>
        <div class="goal-info">
            <h3>${goal.title}</h3>
            <span class="goal-category">${goal.category.split('|')[1] || goal.category}</span>
        </div>
        <div class="goal-actions">
            <button class="add-money-btn" onclick="showAddMoneyModal(${goal.id}, 'add')">Add Money</button>
            <button class="remove-money-btn" onclick="showAddMoneyModal(${goal.id}, 'remove')">Remove Money</button>
            <button class="delete-goal-btn" onclick="deleteGoal(${goal.id})">Delete</button>
        </div>
    `;
    
    return goalCard;
}

function initializeProgressCircle(goalCard, goal) {
    const circle = goalCard.querySelector('.progress-ring-circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
    
    const progress = goal.target_amount > 0 
        ? (goal.current_amount / goal.target_amount) * 100 
        : 0;
    
    const offset = circumference - (progress / 100 * circumference);
    circle.style.strokeDashoffset = offset;
}

// Handle new goal form submission
async function handleNewGoalSubmit(event) {
    event.preventDefault();
    
    try {
        const formData = new FormData(event.target);
        const title = formData.get('title');
        const targetAmount = formData.get('targetAmount');
        const category = formData.get('category');
        
        const newGoal = await api.createGoal({
            title,
            targetAmount: parseFloat(targetAmount),
            category
        });
        
        console.log('Goal created:', newGoal);
        
        // Close modal and reset form
        closeModal('newGoalModal');
        event.target.reset();
        
        // Reload goals
        await loadGoals();
        
    } catch (error) {
        console.error('Error creating goal:', error);
        showError('Failed to create goal');
    }
}

// Load categories into select
async function loadCategories() {
    try {
        const categories = await api.getCategories();
        const categorySelect = document.getElementById('goal-category-select');
        
        // Clear existing options
        categorySelect.innerHTML = '';
        
        if (!categories || !Array.isArray(categories)) {
            console.error('Invalid categories data received:', categories);
            return;
        }

        // Add default categories with proper emoji formatting
        const defaultCategories = [
            { emoji: '🍔', name: 'Food' },
            { emoji: '🚌', name: 'Transport' },
            { emoji: '💡', name: 'Utilities' },
            // Add any other default categories here
        ];

        // Combine default and custom categories
        const allCategories = [...defaultCategories, ...categories.filter(cat => !cat.is_default)];

        // Add all categories to select
        allCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = `${category.emoji}|${category.name}`; // Store emoji and name together
            option.textContent = `${category.emoji} ${category.name}`;
            categorySelect.appendChild(option);
        });

        // Add the Custom option at the end
        const customOption = document.createElement('option');
        customOption.value = 'Custom';
        customOption.textContent = '➕ Add Custom Category';
        categorySelect.appendChild(customOption);

        // Add custom category input fields to the form
        const formGroup = document.getElementById('newGoalForm');
        const customCategoryGroup = document.createElement('div');
        customCategoryGroup.id = 'goal-custom-category-group';
        customCategoryGroup.className = 'form-group hidden';
        customCategoryGroup.innerHTML = `
            <div class="custom-category-inputs">
                <label for="goal-custom-category-name">Category Name</label>
                <input type="text" id="goal-custom-category-name" name="customCategoryName" placeholder="Category Name">
                <label for="goal-custom-category-emoji">Emoji</label>
                <input type="text" id="goal-custom-category-emoji" name="customEmoji" placeholder="Enter Emoji">
            </div>
        `;
        formGroup.insertBefore(customCategoryGroup, formGroup.querySelector('button'));

        // Add event listener for category selection
        categorySelect.addEventListener('change', (e) => {
            const customCategoryGroup = document.getElementById('goal-custom-category-group');
            if (e.target.value === 'Custom') {
                customCategoryGroup.classList.remove('hidden');
            } else {
                customCategoryGroup.classList.add('hidden');
            }
        });

    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Modal functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Utility functions
function showError(message) {
    // Implement error display logic here
    alert(message);
}

// Make functions available globally
window.openNewGoalModal = () => openModal('newGoalModal');
window.deleteGoal = async (goalId) => {
    if (confirm('Are you sure you want to delete this goal?')) {
        try {
            await api.deleteGoal(goalId);
            await loadGoals();
        } catch (error) {
            console.error('Error deleting goal:', error);
            showError('Failed to delete goal');
        }
    }
};

window.showAddMoneyModal = (goalId, action = 'add') => {
    const form = document.getElementById('addMoneyForm');
    const modalTitle = document.querySelector('#addMoneyModal h2');
    const submitButton = form.querySelector('.submit-btn');
    
    if (form) {
        const goalIdInput = form.querySelector('#add-money-goal-id');
        const actionInput = document.createElement('input');
        actionInput.type = 'hidden';
        actionInput.name = 'action';
        actionInput.value = action;
        form.appendChild(actionInput);
        
        if (goalIdInput) {
            goalIdInput.value = goalId;
        }
        
        // Update modal title and button text based on action
        modalTitle.textContent = action === 'add' ? 'Add Money to Goal' : 'Remove Money from Goal';
        submitButton.textContent = action === 'add' ? 'Add Money' : 'Remove Money';
    }
    openModal('addMoneyModal');
};

async function handleCategoryChange(event) {
    const customCategoryGroup = document.getElementById('goal-custom-category-group');
    if (event.target.value === 'Custom') {
        customCategoryGroup.classList.remove('hidden');
    } else {
        customCategoryGroup.classList.add('hidden');
    }
}

async function initializeGoalsTimeline() {
    try {
        const goals = await api.getGoals();
        const chartElement = document.getElementById('goalsTimelineChart');
        
        if (!goals.length || !chartElement) return;

        const options = {
            series: goals.map(goal => ({
                name: goal.title,
                data: [[new Date(), goal.currentAmount], [calculateProjectedDate(goal), goal.targetAmount]]
            })),
            chart: {
                type: 'line',
                height: '100%',
                toolbar: {
                    show: false
                }
            },
            // ... more chart options ...
        };

        const chart = new ApexCharts(chartElement, options);
        chart.render();
    } catch (error) {
        console.error('Error initializing timeline:', error);
    }
}

function calculateProjectedDate(goal) {
    // Calculate projected completion date based on current progress and rate
    // This is a placeholder implementation
    const today = new Date();
    return new Date(today.setMonth(today.getMonth() + 3));
}

function openNewGoalModal() {
    console.log('Opening new goal modal');
    const modal = document.getElementById('newGoalModal');
    if (modal) {
        modal.style.display = 'block';
        console.log('Modal display set to block');
        
        // Focus on the first input field
        setTimeout(() => {
            const firstInput = modal.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 100);
    } else {
        console.error('New goal modal not found');
    }
}

function createNewGoalButton() {
    console.log('Creating new goal button');
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        const existingButton = mainContent.querySelector('.new-goal-btn');
        if (!existingButton) {
            const newButton = document.createElement('button');
            newButton.className = 'new-goal-btn';
            newButton.textContent = '+ New Goal';
            newButton.setAttribute('onclick', 'openNewGoalModal()');
            
            // Insert before the first modal
            const firstModal = mainContent.querySelector('.modal');
            if (firstModal) {
                mainContent.insertBefore(newButton, firstModal);
            } else {
                mainContent.appendChild(newButton);
            }
            
            console.log('New goal button created and added to the page');
        }
    }
}

// Make sure this function is called when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    setupEventListeners();
    loadGoals();
    loadCategories();
});

// Make the function globally available
window.openNewGoalModal = openNewGoalModal;
window.deleteGoal = deleteGoal;

// Update the CSS for the new progress circle
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    .progress-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-90deg);
    }
    
    .progress-ring-circle {
        transition: stroke-dashoffset 0.35s;
        transform-origin: 50% 50%;
    }
    
    .goal-circle {
        position: relative;
        width: 120px;
        height: 120px;
        margin: 0 auto;
    }
    
    .progress-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        width: 100%;
    }
`;
document.head.appendChild(styleSheet);

// Add this CSS for error message
const errorStyles = document.createElement('style');
errorStyles.textContent = `
    .error-message {
        text-align: center;
        padding: 20px;
        margin: 20px;
        background-color: #fff3f3;
        border: 1px solid #ffcdd2;
        border-radius: 8px;
    }
    .error-message button {
        margin-top: 10px;
        padding: 8px 16px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    .error-message button:hover {
        background-color: #45a049;
    }
`;
document.head.appendChild(errorStyles);

// Add these functions to handle horizontal scrolling
function createGoalsContainer() {
    const container = document.querySelector('.goals-container');
    if (!container) return;

    // Create wrapper for horizontal scrolling
    container.innerHTML = `
        <button class="scroll-btn scroll-left" onclick="scrollGoals('left')">&lt;</button>
        <div class="goals-wrapper">
            <div class="goals-scroll"></div>
        </div>
        <button class="scroll-btn scroll-right" onclick="scrollGoals('right')">&gt;</button>
    `;

    return container.querySelector('.goals-scroll');
}

function scrollGoals(direction) {
    const wrapper = document.querySelector('.goals-wrapper');
    const scrollAmount = wrapper.clientWidth * 0.8; // Scroll 80% of container width
    const currentScroll = wrapper.scrollLeft;
    
    wrapper.scrollTo({
        left: direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount,
        behavior: 'smooth'
    });
}

function updateScrollButtons() {
    const wrapper = document.querySelector('.goals-wrapper');
    const leftBtn = document.querySelector('.scroll-btn.scroll-left');
    const rightBtn = document.querySelector('.scroll-btn.scroll-right');
    
    if (!wrapper || !leftBtn || !rightBtn) return;
    
    // Show/hide buttons based on scroll position
    wrapper.addEventListener('scroll', () => {
        leftBtn.style.display = wrapper.scrollLeft > 0 ? 'block' : 'none';
        rightBtn.style.display = 
            wrapper.scrollLeft < (wrapper.scrollWidth - wrapper.clientWidth - 10) ? 'block' : 'none';
    });
    
    // Initial check
    leftBtn.style.display = 'none';
    rightBtn.style.display = 
        wrapper.scrollWidth > wrapper.clientWidth ? 'block' : 'none';
}

// Update deleteGoal function
async function deleteGoal(goalId) {
    try {
        console.log('Attempting to delete goal:', goalId);
        
        if (!confirm('Are you sure you want to delete this goal?')) {
            return;
        }

        // Use the api module to delete the goal
        await api.deleteGoal(goalId);
        console.log('Goal deleted successfully on server');

        // Find and remove the goal card
        const goalCard = document.querySelector(`.goal-card[data-goal-id="${goalId}"]`);
        console.log('Found goal card to delete:', goalCard);
        
        if (goalCard) {
            // Add fade out animation
            goalCard.style.transition = 'all 0.3s ease';
            goalCard.style.opacity = '0';
            goalCard.style.transform = 'scale(0.8)';
            
            // Remove the element after animation
            setTimeout(() => {
                goalCard.remove();
                console.log('Goal card removed from DOM');
                
                // Check if there are any goals left
                const goalsScroll = document.querySelector('.goals-scroll');
                if (goalsScroll && goalsScroll.children.length === 0) {
                    goalsScroll.innerHTML = '<p class="no-goals">No goals yet. Create one to get started!</p>';
                    console.log('No goals left, showing empty state');
                }
                
                updateScrollButtons();
            }, 300);
        } else {
            console.error('Goal card not found in DOM');
            // If we can't find the card, reload all goals
            await loadGoals();
        }

    } catch (error) {
        console.error('Error deleting goal:', error);
        alert('Failed to delete goal. Please try again.');
    }
}

// Update handleAddMoneySubmit to handle balance updates
async function handleAddMoneySubmit(event) {
    event.preventDefault();
    
    try {
        const formData = new FormData(event.target);
        const goalId = document.getElementById('add-money-goal-id').value;
        const amount = parseFloat(formData.get('amount'));
        const recurring = formData.get('recurring');
        const action = formData.get('action') || 'add';
        
        if (!goalId || isNaN(amount) || amount <= 0) {
            throw new Error('Invalid input data');
        }

        if (recurring !== 'one-time') {
            if (action === 'remove') {
                throw new Error('Recurring payments can only be used for adding money');
            }
            // Handle recurring payment
            await api.scheduleRecurringPayment(goalId, {
                amount,
                interval: recurring
            });
        } else {
            // Handle one-time payment
            const response = await api.updateGoal(goalId, { 
                amount: action === 'add' ? amount : -amount 
            });
            
            // Update the user's balance display
            if (response.balance !== undefined) {
                updateBalanceDisplay(response.balance);
            }
        }
        
        // Close modal and reset form
        closeModal('addMoneyModal');
        event.target.reset();
        
        // Reload goals to show updated amount
        await loadGoals();
        
    } catch (error) {
        console.error('Error updating goal amount:', error);
        if (error.message.includes('Insufficient balance')) {
            showError('Insufficient balance to add money to goal');
        } else {
            showError(error.message || 'Failed to update goal amount');
        }
    }
}

// Add this function to update the balance display
function updateBalanceDisplay(newBalance) {
    const balanceElement = document.getElementById('user-balance');
    if (balanceElement) {
        balanceElement.textContent = `$${newBalance.toFixed(2)}`;
    }
}

// Add event listener when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    const addMoneyForm = document.getElementById('addMoneyForm');
    if (addMoneyForm) {
        addMoneyForm.addEventListener('submit', handleAddMoneySubmit);
    }
}); 