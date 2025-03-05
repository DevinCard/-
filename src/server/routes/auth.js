// Register endpoint
router.post('/register', async (req, res) => {
    const { fullName, email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            'INSERT INTO users (full_name, email, password, balance) VALUES (?, ?, ?, ?)',
            [fullName, email, hashedPassword, 0.00],
            function(err) {
                if (err) {
                    console.error('Error creating user:', err);
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: 'Failed to create user' });
                }

                const token = jwt.sign({ id: this.lastID }, 'your-secret-key', { expiresIn: '24h' });
                res.json({ token });
            }
        );
    } catch (err) {
        console.error('Error hashing password:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login endpoint should also return the balance
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Server error' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id }, 'your-secret-key', { expiresIn: '24h' });
        res.json({ 
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                balance: parseFloat(user.balance || 0)
            }
        });
    });
}); 