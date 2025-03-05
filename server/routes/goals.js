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
router.get('/goals', auth, async (req, res) => {
    console.log('GET /goals endpoint hit');
    db.all(
        'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id],
        (err, rows) => {
            if (err) {
                console.error('Error fetching goals:', err);
                return res.status(500).json({ error: 'Failed to fetch goals' });
            }
            console.log('Query result:', rows);
            res.json(rows);
        }
    );
});

// Create a new goal
router.post('/goals', auth, (req, res) => {
    const { title, targetAmount, category } = req.body;
    db.run(
        'INSERT INTO goals (user_id, title, target_amount, current_amount, category) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, title, targetAmount, 0, category],
        function(err) {
            if (err) {
                console.error('Error creating goal:', err);
                return res.status(500).json({ error: 'Failed to create goal' });
            }
            db.get('SELECT * FROM goals WHERE id = ?', [this.lastID], (err, row) => {
                if (err) {
                    console.error('Error fetching created goal:', err);
                    return res.status(500).json({ error: 'Failed to fetch created goal' });
                }
                res.json(row);
            });
        }
    );
});

// Update goal (add money)
router.patch('/goals/:id', auth, (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    
    db.run(
        'UPDATE goals SET current_amount = current_amount + ? WHERE id = ? AND user_id = ?',
        [amount, id, req.user.id],
        function(err) {
            if (err) {
                console.error('Error updating goal:', err);
                return res.status(500).json({ error: 'Failed to update goal' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Goal not found' });
            }
            db.get('SELECT * FROM goals WHERE id = ?', [id], (err, row) => {
                if (err) {
                    console.error('Error fetching updated goal:', err);
                    return res.status(500).json({ error: 'Failed to fetch updated goal' });
                }
                res.json(row);
            });
        }
    );
});

// Delete a goal
router.delete('/goals/:id', auth, (req, res) => {
    const { id } = req.params;
    db.run(
        'DELETE FROM goals WHERE id = ? AND user_id = ?',
        [id, req.user.id],
        function(err) {
            if (err) {
                console.error('Error deleting goal:', err);
                return res.status(500).json({ error: 'Failed to delete goal' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Goal not found' });
            }
            res.json({ message: 'Goal deleted successfully' });
        }
    );
});

module.exports = router; 