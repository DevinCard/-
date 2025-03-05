const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./middleware/auth');
const goalsRouter = require('./routes/goals');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../../')));

// Create/connect to database
const db = new sqlite3.Database(path.join(__dirname, '../database/vaultly.db'), (err) => {
    if (err) {
        console.error('Could not connect to database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Drop existing tables in reverse order of dependencies
        db.run(`DROP TABLE IF EXISTS goals`);
        db.run(`DROP TABLE IF EXISTS transactions`);
        db.run(`DROP TABLE IF EXISTS categories`);
        db.run(`DROP TABLE IF EXISTS users`);

        // Create users table with balance column
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                balance DECIMAL(10,2) DEFAULT 0.00
            )
        `, (err) => {
            if (err) console.error('Error creating users table:', err);
        });

        // Create categories table with simplified UNIQUE constraint
        db.run(`
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                emoji TEXT NOT NULL,
                is_default BOOLEAN DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `, (err) => {
            if (err) console.error('Error creating categories table:', err);
        });

        // Create transactions table
        db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                type TEXT,
                title TEXT,
                date TEXT,
                category TEXT,
                amount REAL,
                recurring TEXT DEFAULT 'one-time',
                recurrence_interval TEXT,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `, (err) => {
            if (err) console.error('Error creating transactions table:', err);
        });

        // Insert default categories
        db.run(`
            INSERT OR IGNORE INTO categories (name, emoji, is_default, user_id) VALUES 
            ('Food', '🍔', 1, NULL),
            ('Transport', '🚌', 1, NULL),
            ('Utilities', '💡', 1, NULL)
        `, (err) => {
            if (err) console.error('Error inserting default categories:', err);
        });

        // Add goals table
        db.run(`
            CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                title TEXT NOT NULL,
                target_amount DECIMAL(10,2) NOT NULL,
                current_amount DECIMAL(10,2) DEFAULT 0,
                category TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `, (err) => {
            if (err) console.error('Error creating goals table:', err);
        });
    });
}

// User Routes
app.post('/api/signup', async (req, res) => {
    console.log('Received signup request:', req.body);
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        console.log('Validation failed:', { username, email, password: '***' });
        return res.status(400).json({ 
            error: 'Full name, email, and password are required' 
        });
    }

    try {
        const userExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
                if (err) {
                    console.error('Error checking user existence:', err);
                    reject(err);
                }
                resolve(row);
            });
        });

        if (userExists) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)',
                [username, email, hashedPassword],
                function(err) {
                    if (err) {
                        console.error('Database insertion error:', err);
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });

        const token = jwt.sign(
            { id: result, full_name: username },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({ 
            message: 'User created successfully',
            token
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Error creating user' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email
            }
        });
    });
});

// API Routes
app.get('/api/balance', authMiddleware, (req, res) => {
    const sql = `
        SELECT COALESCE(SUM(CASE WHEN type = 'Deposit' THEN amount ELSE -amount END), 0) as balance 
        FROM transactions
        WHERE user_id = ?
    `;
    
    db.get(sql, [req.user.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ balance: row.balance });
    });
});

app.get('/api/transactions', authMiddleware, (req, res) => {
    const userId = req.user.id;
    db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC', [userId], (err, transactions) => {
        if (err) {
            console.error('Error fetching transactions:', err);
            return res.status(500).json({ error: 'Failed to fetch transactions' });
        }
        res.json(transactions || []);
    });
});

app.post('/api/transactions', authMiddleware, (req, res) => {
    const { type, title, date, category, amount, recurring, recurrenceInterval } = req.body;
    
    // Validate the input
    if (!type || !title || !date || !category || !amount) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const sql = `
        INSERT INTO transactions (user_id, type, title, date, category, amount, recurring, recurrence_interval) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [
        req.user.id, 
        type, 
        title, 
        date, 
        category, 
        amount,
        recurring || 'one-time',
        recurrenceInterval
    ], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ 
                error: 'Failed to add transaction',
                details: err.message 
            });
        }
        
        res.json({ 
            id: this.lastID,
            message: 'Transaction added successfully' 
        });
    });
});

app.get('/api/categories', authMiddleware, (req, res) => {
    const userId = req.user.id;
    const sql = `
        SELECT DISTINCT id, name, emoji, is_default, user_id 
        FROM categories 
        WHERE is_default = 1 
        OR user_id = ?
        ORDER BY 
            is_default DESC,
            name ASC
    `;
    
    db.all(sql, [userId], (err, categories) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).json({ error: 'Failed to fetch categories' });
        }
        
        // Remove duplicates based on name
        const uniqueCategories = Array.from(
            new Map(categories.map(cat => [cat.name, cat])).values()
        );
        
        res.json(uniqueCategories);
    });
});

app.post('/api/categories', authMiddleware, (req, res) => {
    const { name, emoji } = req.body;
    const userId = req.user.id;

    if (!name || !emoji) {
        return res.status(400).json({ error: 'Name and emoji are required' });
    }

    db.run(
        'INSERT INTO categories (user_id, name, emoji, is_default) VALUES (?, ?, ?, 0)',
        [userId, name, emoji],
        function(err) {
            if (err) {
                console.error('Error saving category:', err);
                return res.status(500).json({ error: 'Failed to save category' });
            }
            
            res.json({ 
                id: this.lastID,
                name,
                emoji,
                user_id: userId,
                is_default: 0
            });
        }
    );
});

// Add this endpoint for updating transactions
app.put('/api/transactions/:id', authMiddleware, (req, res) => {
    const transactionId = req.params.id;
    const { type, title, date, category, amount, recurring, recurrenceInterval } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!type || !title || !date || !category || !amount) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    if (!['Deposit', 'Withdrawal'].includes(type)) {
        return res.status(400).json({ error: 'Invalid transaction type' });
    }

    // Update the transaction
    const sql = `
        UPDATE transactions 
        SET type = ?, title = ?, date = ?, category = ?, amount = ?, recurring = ?, recurrence_interval = ?
        WHERE id = ? AND user_id = ?
    `;

    db.run(sql, [
        type, 
        title, 
        date, 
        category, 
        amount, 
        recurring || 'one-time',
        recurrenceInterval,
        transactionId, 
        userId
    ], function(err) {
        if (err) {
            console.error('Error updating transaction:', err);
            return res.status(500).json({ error: 'Failed to update transaction' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Transaction not found or unauthorized' });
        }

        // Return the updated transaction
        db.get(
            'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
            [transactionId, userId],
            (err, transaction) => {
                if (err) {
                    console.error('Error fetching updated transaction:', err);
                    return res.status(500).json({ error: 'Failed to fetch updated transaction' });
                }
                res.json(transaction);
            }
        );
    });
});

// Add this near the other routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// HTML Routes with correct paths
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../src/resource/dashboard.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../src/resource/dashboard.html'));
});

app.get('/transactions', (req, res) => {
    res.sendFile(path.join(__dirname, '../../src/resource/transaction.html'));
});

app.get('/categories', (req, res) => {
    res.sendFile(path.join(__dirname, '../resource/Categories.html'));
});

app.get('/goals', (req, res) => {
    res.sendFile(path.join(__dirname, '../resource/goals.html'));
});

app.get('/summaries', (req, res) => {
    res.sendFile(path.join(__dirname, '../resource/summaries.html'));
});

app.get('/rpurchases', (req, res) => {
    res.sendFile(path.join(__dirname, '../resource/Rpurchases.html'));
});

// Mount the goals router with the /api prefix
app.use('/api', goalsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;