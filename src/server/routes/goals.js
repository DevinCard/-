const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// Debug middleware for this router
router.use((req, res, next) => {
    console.log('Goals Router:', req.method, req.path);
    next();
});

// Get all goals for a user
router.get('/goals', auth, (req, res) => {
    console.log('GET /goals endpoint hit, user ID:', req.user.id);
    
    db.all(
        'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id],
        (err, goals) => {
            if (err) {
                console.error('Database error fetching goals:', err);
                return res.status(500).json({ error: 'Failed to fetch goals' });
            }
            
            console.log('Found goals:', goals);
            
            // Format the goals before sending
            const formattedGoals = goals.map(goal => ({
                ...goal,
                target_amount: parseFloat(goal.target_amount),
                current_amount: parseFloat(goal.current_amount || 0)
            }));
            
            res.json(formattedGoals);
        }
    );
});

// Create a new goal
router.post('/goals', auth, (req, res) => {
    const { title, targetAmount, category } = req.body;
    const userId = req.user.id;

    // Ensure numbers are properly formatted
    const formattedTargetAmount = parseFloat(targetAmount);

    db.run(
        'INSERT INTO goals (user_id, title, target_amount, current_amount, category) VALUES (?, ?, ?, ?, ?)',
        [userId, title, formattedTargetAmount, 0, category],
        function(err) {
            if (err) {
                console.error('Error creating goal:', err);
                return res.status(500).json({ error: 'Failed to create goal' });
            }
            db.get('SELECT * FROM goals WHERE id = ?', [this.lastID], (err, goal) => {
                if (err) {
                    console.error('Error fetching created goal:', err);
                    return res.status(500).json({ error: 'Failed to fetch created goal' });
                }
                // Format numbers before sending
                const formattedGoal = {
                    ...goal,
                    target_amount: parseFloat(goal.target_amount),
                    current_amount: parseFloat(goal.current_amount)
                };
                res.json(formattedGoal);
            });
        }
    );
});

// Update goal (add/remove money)
router.patch('/goals/:id', auth, (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    const userId = req.user.id;

    console.log(`Updating goal ${id} by ${amount} for user ${userId}`);

    // Start a transaction to ensure data consistency
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // First verify the goal exists and belongs to the user
        db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', 
            [id, userId],
            (err, goal) => {
                if (err) {
                    db.run('ROLLBACK');
                    console.error('Error finding goal:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                if (!goal) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: 'Goal not found' });
                }

                // Get user's current balance
                db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, user) => {
                    if (err) {
                        db.run('ROLLBACK');
                        console.error('Error fetching user balance:', err);
                        return res.status(500).json({ error: 'Failed to fetch user balance' });
                    }

                    const currentBalance = parseFloat(user.balance || 0);
                    const newBalance = currentBalance - amount; // Subtract when adding to goal, add when removing

                    // Check if user has enough balance when adding money
                    if (amount > 0 && newBalance < 0) {
                        db.run('ROLLBACK');
                        return res.status(400).json({ error: 'Insufficient balance' });
                    }

                    // Check if removing more than current goal amount
                    const newGoalAmount = parseFloat(goal.current_amount) + parseFloat(amount);
                    if (newGoalAmount < 0) {
                        db.run('ROLLBACK');
                        return res.status(400).json({ error: 'Cannot remove more money than current goal amount' });
                    }

                    // Update both the goal amount and user balance
                    db.run(
                        'UPDATE goals SET current_amount = ? WHERE id = ? AND user_id = ?',
                        [newGoalAmount, id, userId],
                        function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                console.error('Error updating goal:', err);
                                return res.status(500).json({ error: 'Failed to update goal' });
                            }

                            db.run(
                                'UPDATE users SET balance = ? WHERE id = ?',
                                [newBalance, userId],
                                function(err) {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        console.error('Error updating user balance:', err);
                                        return res.status(500).json({ error: 'Failed to update balance' });
                                    }

                                    db.run('COMMIT');

                                    // Return both updated goal and balance
                                    db.get('SELECT * FROM goals WHERE id = ?', [id], (err, updatedGoal) => {
                                        if (err) {
                                            console.error('Error fetching updated goal:', err);
                                            return res.status(500).json({ error: 'Failed to fetch updated goal' });
                                        }
                                        const response = {
                                            goal: {
                                                ...updatedGoal,
                                                target_amount: parseFloat(updatedGoal.target_amount),
                                                current_amount: parseFloat(updatedGoal.current_amount)
                                            },
                                            balance: newBalance
                                        };
                                        res.json(response);
                                    });
                                }
                            );
                        }
                    );
                });
            }
        );
    });
});

// Delete a goal
router.delete('/goals/:id', auth, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    console.log(`Attempting to delete goal ${id} for user ${userId}`);

    // First delete any recurring payments associated with this goal
    db.run('DELETE FROM recurring_payments WHERE goal_id = ? AND user_id = ?', 
        [id, userId], 
        (err) => {
            if (err) {
                console.error('Error deleting recurring payments:', err);
                return res.status(500).json({ error: 'Failed to delete recurring payments' });
            }

            // Then delete the goal itself
            db.run('DELETE FROM goals WHERE id = ? AND user_id = ?',
                [id, userId],
                function(err) {
                    if (err) {
                        console.error('Error deleting goal:', err);
                        return res.status(500).json({ error: 'Failed to delete goal' });
                    }
                    if (this.changes === 0) {
                        return res.status(404).json({ error: 'Goal not found or unauthorized' });
                    }
                    console.log(`Successfully deleted goal ${id}`);
                    res.json({ message: 'Goal deleted successfully' });
                }
            );
        }
    );
});

// Schedule a recurring payment for a goal
router.post('/goals/:id/recurring', auth, (req, res) => {
    const { id } = req.params;
    const { amount, interval } = req.body;
    const userId = req.user.id;

    // First verify the goal exists and belongs to the user
    db.get(
        'SELECT * FROM goals WHERE id = ? AND user_id = ?',
        [id, userId],
        (err, goal) => {
            if (err) {
                console.error('Error finding goal:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!goal) {
                return res.status(404).json({ error: 'Goal not found' });
            }

            // Insert the recurring payment record
            db.run(
                `INSERT INTO recurring_payments 
                (goal_id, user_id, amount, interval, next_payment_date) 
                VALUES (?, ?, ?, ?, date('now'))`,
                [id, userId, amount, interval],
                function(err) {
                    if (err) {
                        console.error('Error creating recurring payment:', err);
                        return res.status(500).json({ error: 'Failed to create recurring payment' });
                    }
                    res.json({
                        id: this.lastID,
                        goal_id: id,
                        amount,
                        interval,
                        message: 'Recurring payment scheduled successfully'
                    });
                }
            );
        }
    );
});

// Get recurring payments for a goal
router.get('/goals/:id/recurring', auth, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    db.all(
        'SELECT * FROM recurring_payments WHERE goal_id = ? AND user_id = ?',
        [id, userId],
        (err, payments) => {
            if (err) {
                console.error('Error fetching recurring payments:', err);
                return res.status(500).json({ error: 'Failed to fetch recurring payments' });
            }
            res.json(payments);
        }
    );
});

// Add this new endpoint to get user's balance
router.get('/user/balance', auth, (req, res) => {
    const userId = req.user.id;
    
    db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Error fetching user balance:', err);
            return res.status(500).json({ error: 'Failed to fetch user balance' });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ balance: parseFloat(user.balance || 0) });
    });
});

module.exports = router; 