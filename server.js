const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET_KEY = 'sarain-secret-2024';
const db = new sqlite3.Database('/tmp/sarain.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, email TEXT DEFAULT '', password TEXT, security_question TEXT DEFAULT '', security_answer TEXT DEFAULT '', is_admin INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, description TEXT, price REAL, sale_price REAL, category TEXT, subcategory TEXT DEFAULT '', images TEXT DEFAULT '', stock INTEGER DEFAULT 10, sizes TEXT DEFAULT 'S,M,L,XL', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, subcategories TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, total REAL, name TEXT, phone TEXT, address TEXT, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, product_name TEXT, quantity INTEGER, price REAL, size TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS search_history (id INTEGER PRIMARY KEY AUTOINCREMENT, term TEXT, searched_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
        if (row && row.count === 0) {
            const cats = [['Men','Hoodies,T-Shirts,Jeans,Jackets,Shirts'],['Women','Sarees,Korean Dresses,Tops,Kurtis,Skirts'],['Kids','T-Shirts,Shorts,Dresses,Hoodies']];
            const stmt = db.prepare('INSERT INTO categories (name, subcategories) VALUES (?, ?)');
            cats.forEach(c => stmt.run(c[0], c[1]));
            stmt.finalize();
        }
    });
});

const storage = multer.diskStorage({ destination: '/tmp/uploads/', filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname) });
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('/tmp/uploads'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/men', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/women', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/kids', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/product/:id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'product.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'views', 'checkout.html')));

app.post('/api/register', (req, res) => {
    const { username, password, security_question, security_answer } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Please fill all fields' });
    if (password.length < 4) return res.json({ success: false, message: 'Password must be at least 4 characters' });
    const hash = bcrypt.hashSync(password, 10);
    const ans = security_answer ? bcrypt.hashSync(security_answer.toLowerCase().trim(), 10) : '';
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
        if (row) return res.json({ success: false, message: 'Username already taken' });
        db.run('INSERT INTO users (username, password, security_question, security_answer) VALUES (?, ?, ?, ?)', [username, hash, security_question || '', ans], function(err) { 
            if (err) return res.json({ success: false, message: 'Registration failed' });
            res.json({ success: true, message: 'Account created!' }); 
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Please enter username and password' });
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (!user) return res.json({ success: false, message: 'Account not found' });
        if (!bcrypt.compareSync(password, user.password)) return res.json({ success: false, message: 'Incorrect password' });
        const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, SECRET_KEY);
        res.json({ success: true, token, user: { id: user.id, username: user.username, is_admin: user.is_admin } });
    });
});

app.post('/api/forgot-password', (req, res) => {
    db.get('SELECT id, security_question FROM users WHERE username = ?', [req.body.username], (err, user) => {
        if (!user) return res.json({ success: false, message: 'Username not found' });
        res.json({ success: true, userId: user.id, question: user.security_question || 'No question set' });
    });
});

app.post('/api/reset-password', (req, res) => {
    const { userId, answer, newPassword } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (!user || !bcrypt.compareSync(answer.toLowerCase().trim(), user.security_answer)) return res.json({ success: false, message: 'Wrong answer' });
        db.run('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), userId]);
        res.json({ success: true, message: 'Password updated!' });
    });
});

app.get('/api/categories', (req, res) => db.all('SELECT * FROM categories', (err, cats) => res.json(cats || [])));

app.get('/api/products', (req, res) => {
    const { category, subcategory, search } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (subcategory) { query += ' AND subcategory = ?'; params.push(subcategory); }
    if (search) { query += ' AND (name LIKE ? OR description LIKE ? OR category LIKE ? OR subcategory LIKE ?)'; const s='%'+search+'%'; params.push(s,s,s,s); }
    db.all(query, params, (err, products) => res.json(products || []));
});

app.get('/api/products/:id', (req, res) => db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, p) => res.json(p || {})));

app.get('/api/search-history', (req, res) => db.all('SELECT * FROM search_history ORDER BY id DESC LIMIT 10', (err, rows) => res.json(rows || [])));
app.post('/api/search-history', (req, res) => { if(req.body.term) db.run('INSERT INTO search_history (term) VALUES (?)', [req.body.term]); res.json({ success: true }); });

app.post('/api/admin/products', upload.array('images', 5), (req, res) => {
    const { name, description, price, sale_price, category, subcategory, stock, sizes } = req.body;
    const images = req.files ? req.files.map(f => '/uploads/' + f.filename).join(',') : '';
    db.run('INSERT INTO products (name, description, price, sale_price, category, subcategory, images, stock, sizes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, description, price, sale_price || null, category, subcategory || '', images, stock || 10, sizes || 'S,M,L,XL'],
        function(err) { res.json({ success: !err, id: this.lastID }); });
});

app.delete('/api/admin/products/:id', (req, res) => db.run('DELETE FROM products WHERE id = ?', [req.params.id], err => res.json({ success: !err })));
app.get('/api/admin/users', (req, res) => db.all('SELECT id, username, security_question, created_at FROM users ORDER BY id DESC', (err, u) => res.json(u || [])));
app.delete('/api/admin/users/:id', (req, res) => db.run('DELETE FROM users WHERE id = ?', [req.params.id], err => res.json({ success: !err, message: err ? 'Error' : 'Deleted!' })));
app.get('/api/admin/orders', (req, res) => db.all('SELECT * FROM orders ORDER BY id DESC', (err, o) => res.json(o || [])));

app.post('/api/orders', (req, res) => {
    const { items, total, name, phone, address } = req.body;
    db.run('INSERT INTO orders (user_id, total, name, phone, address) VALUES (?, ?, ?, ?, ?)', [0, total, name, phone, address], function(err) {
        if (err) return res.json({ success: false });
        const oid = this.lastID;
        const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, quantity, price, size) VALUES (?, ?, ?, ?, ?, ?)');
        items.forEach(i => stmt.run(oid, i.id, i.name, i.quantity || 1, i.price, i.size || 'M'));
        stmt.finalize();
        res.json({ success: true, orderId: oid });
    });
});

app.listen(PORT, () => console.log(`SARAIN: http://localhost:${PORT}`));