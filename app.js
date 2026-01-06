const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;
const HOST = '0.0.0.0';

// ================= VIEW ENGINE =================
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
const { ensureAdmin } = require('./middlewares/auth');

// ================= SESSION =================
app.use(
    session({
        secret: 'playtogether-farm',
        resave: false,
        saveUninitialized: true
    })
);


function readAdmins() {
    return JSON.parse(fs.readFileSync(ADMIN_PATH));
}
// ================= JSON UTILS =================
const readJSON = (p) => {
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const writeJSON = (p, data) =>
    fs.writeFileSync(p, JSON.stringify(data, null, 2));

// ================= DATA PATH =================
const DATA = './data';
const PRODUCTS_PATH = `${DATA}/products.json`;
const VARIANTS_PATH = `${DATA}/variants.json`;
const PV_PATH = `${DATA}/product_variants.json`;
const ORDERS_PATH = `${DATA}/orders.json`;
const ORDER_ITEMS_PATH = `${DATA}/order_items.json`;
const ADMIN_PATH  = `${DATA}/admins.json`;

// ================= BUILD SHOP DATA =================
function getShopData() {
    const products = readJSON(PRODUCTS_PATH);
    const variants = readJSON(VARIANTS_PATH);
    const pv = readJSON(PV_PATH);

    return pv.map(item => {
        const product = products.find(p => p.id === item.product_id);
        const variant = variants.find(v => v.id === item.variant_id);

        return {
            pv_id: item.id,
            name: product.name,
            icon: product.icon,
            img: product.image,
            he: variant.name,
            color: variant.color,
            price: item.price,
            quantity: item.quantity
        };
    });
}

// ================= HOME =================
app.get('/', (req, res) => {
    if (!req.session.cart) req.session.cart = [];

    res.render('index', {
        products: getShopData(),
        cart: req.session.cart
    });
});

// ================= ADD TO CART =================
app.post('/add-to-cart/:pv_id', (req, res) => {
    const pv_id = parseInt(req.params.pv_id);
    const pv = readJSON(PV_PATH);
    const item = pv.find(i => i.id === pv_id);

    if (!item || item.quantity <= 0) return res.redirect('/');

    if (!req.session.cart) req.session.cart = [];
    const cart = req.session.cart;

    const cartItem = cart.find(i => i.pv_id === pv_id);

    if (cartItem) cartItem.qty++;
    else cart.push({ pv_id, qty: 1 });

    item.quantity--;
    writeJSON(PV_PATH, pv);

    res.redirect('/');
});

// ================= VIEW CART =================
app.get('/cart', (req, res) => {
    const cart = req.session.cart || [];
    const shop = getShopData();

    const cartView = cart.map(c => {
        const item = shop.find(s => s.pv_id === c.pv_id);
        return { ...item, qty: c.qty };
    });

    const total = cartView.reduce(
        (s, i) => s + i.price * i.qty, 0
    );

    res.render('cart', { cart: cartView, total });
});

// ================= UPDATE CART =================
app.post('/cart/update/:pv_id', (req, res) => {
    const pv_id = parseInt(req.params.pv_id);
    const action = req.body.action;

    const cart = req.session.cart || [];
    const pv = readJSON(PV_PATH);

    const cartItem = cart.find(i => i.pv_id === pv_id);
    const product = pv.find(i => i.id === pv_id);

    if (!cartItem || !product) return res.redirect('/cart');

    if (action === 'increase' && product.quantity > 0) {
        cartItem.qty++;
        product.quantity--;
    }

    if (action === 'decrease' && cartItem.qty > 1) {
        cartItem.qty--;
        product.quantity++;
    }

    writeJSON(PV_PATH, pv);
    res.redirect('/cart');
});

// ================= REMOVE ITEM =================
app.post('/cart/remove/:pv_id', (req, res) => {
    const pv_id = parseInt(req.params.pv_id);

    const cart = req.session.cart || [];
    const pv = readJSON(PV_PATH);

    const index = cart.findIndex(i => i.pv_id === pv_id);
    const product = pv.find(i => i.id === pv_id);

    if (index !== -1 && product) {
        product.quantity += cart[index].qty;
        cart.splice(index, 1);
    }

    writeJSON(PV_PATH, pv);
    req.session.cart = cart;

    res.redirect('/cart');
});

// ✅ Login page
app.get('/admin/login', (req, res) => {
    res.render('admin-login', { error: null });
});

// ✅ Handle login
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    const admins = readAdmins();

    const admin = admins.find(a => a.username === username && a.password === password);
    if (!admin) {
        return res.render('admin-login', { error: 'Sai username hoặc password' });
    }

    req.session.admin = { username };
    res.redirect('/admin');
});

// ✅ Logout
app.get('/logout', (req, res) => {
    req.session.admin = null;
    res.redirect('/admin/login');
});

// 📌 Trang admin chính
app.get('/admin', ensureAdmin, (req, res) => {
    res.render('admin', {}); // file admin.ejs hoặc admin.html
});


// ================= CHECKOUT (TẠO ĐƠN) =================

function autoCancelOrder(orderId) {
    const orders = readJSON(ORDERS_PATH);
    const orderItems = readJSON(ORDER_ITEMS_PATH);
    const pvData = readJSON(PV_PATH);

    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;

    // ❌ Hủy đơn
    order.status = 'cancelled';

    // ➕ Hoàn kho
    orderItems
        .filter(i => i.order_id === orderId)
        .forEach(i => {
            const pv = pvData.find(v => v.id === i.pv_id);
            if (pv) pv.quantity += i.quantity;
        });

    writeJSON(ORDERS_PATH, orders);
    writeJSON(PV_PATH, pvData);

    console.log(`⏰ Đơn ${orderId} đã hết hạn và bị hủy`);
}

app.post('/checkout', (req, res) => {
    const playerName = req.body.player_name?.trim();
    if (!playerName) return res.redirect('/cart');

    const cart = req.session.cart || [];
    if (cart.length === 0) return res.redirect('/');

    const shop = getShopData();
    const orders = readJSON(ORDERS_PATH);
    const orderItems = readJSON(ORDER_ITEMS_PATH);
    const pvData = readJSON(PV_PATH);

    const orderId = 'PT' + Date.now();
    const now = Date.now();
    const expiredAt = now + 15 * 60 * 1000; // ⏱ 15 phút

    // 📦 Tạo order tạm (chưa total)
    const newOrder = {
        id: orderId,
        player_name: playerName,
        status: 'pending',
        created_at: now,
        expired_at: expiredAt,
        total: 0 // ⭐ thêm trường tổng tiền
    };
    orders.push(newOrder);

    // 📦 Tạo order items + trừ kho
    let total = 0;
    cart.forEach(c => {
        const p = shop.find(s => s.pv_id === c.pv_id);
        const pv = pvData.find(v => v.id === c.pv_id);

        if (!p || !pv) return;

        const itemTotal = p.price * c.qty;
        total += itemTotal;

        orderItems.push({
            order_id: orderId,
            pv_id: c.pv_id,
            product_name: p.name,
            variant: p.he,
            quantity: c.qty,
            price: p.price
        });

        // ➖ trừ kho
        pv.quantity -= c.qty;
        if (pv.quantity < 0) pv.quantity = 0;
    });

    // ✅ Cập nhật tổng tiền vào đơn
    newOrder.total = total;

    // 💾 Ghi lại JSON
    writeJSON(ORDERS_PATH, orders);
    writeJSON(ORDER_ITEMS_PATH, orderItems);
    writeJSON(PV_PATH, pvData);

    // 👉 Clear giỏ
    req.session.cart = [];

    res.render('checkout-success', {
        orderId,
        items: orderItems.filter(i => i.order_id === orderId),
        playerName,
        total
    });
});



// ================= QUẢN LÝ NÔNG SẢN - BIẾN THỂ =================
app.get('/admin/product-variants', ensureAdmin, (req, res) => {
    const products = readJSON(PRODUCTS_PATH);
    const variants = readJSON(VARIANTS_PATH);
    const pv = readJSON(PV_PATH);

    const list = pv.map(i => {
        const p = products.find(x => x.id === i.product_id);
        const v = variants.find(x => x.id === i.variant_id);

        return {
            id: i.id,
            product: p?.name || 'N/A',
            variant: v?.name || 'N/A',
            price: i.price,
            quantity: i.quantity
        };
    });

    res.render('admin-product-variants', {
        list,
        products,
        variants
    });
});

app.post('/admin/product-variants/add', ensureAdmin, (req, res) => {
    const pv = readJSON(PV_PATH);

    let { product_id, variant_id, price, quantity } = req.body;

    product_id = Number(product_id);
    variant_id = Number(variant_id);
    quantity = Number(quantity || 0);
    price = price !== '' ? Number(price) : null;

    // 🔍 Tìm cặp product + variant
    const exist = pv.find(
        i => i.product_id === product_id && i.variant_id === variant_id
    );

    if (exist) {
        // ➕ Cộng số lượng
        exist.quantity += quantity;

        // 💰 Nếu có nhập giá thì cập nhật
        if (price !== null && !isNaN(price)) {
            exist.price = price;
        }
    } else {
        // ➕ Thêm mới
        pv.push({
            id: Date.now(),
            product_id,
            variant_id,
            price: price || 0,
            quantity
        });
    }

    writeJSON(PV_PATH, pv);
    res.redirect('/admin/product-variants');
});


app.post('/admin/product-variants/update/:id', ensureAdmin, (req, res) => {
    const id = Number(req.params.id);
    const pv = readJSON(PV_PATH);

    const item = pv.find(i => i.id === id);
    if (item) {
        item.price = Number(req.body.price);
        item.quantity = Number(req.body.quantity);
        writeJSON(PV_PATH, pv);
    }

    res.redirect('/admin/product-variants');
});

app.post('/admin/product-variants/update/:id', ensureAdmin, (req, res) => {
    const id = Number(req.params.id);
    const pv = readJSON(PV_PATH);

    const item = pv.find(i => i.id === id);
    if (item) {
        item.price = Number(req.body.price);
        item.quantity = Number(req.body.quantity);
        writeJSON(PV_PATH, pv);
    }

    res.redirect('/admin/product-variants');
});

// Hiển thị trang admin orders
app.get('/admin/orders', ensureAdmin, (req, res) => {
    const orders = readJSON(ORDERS_PATH);
    const orderItems = readJSON(ORDER_ITEMS_PATH);

    res.render('admin-orders', {
        orders,
        orderItems
    });
});

// Cập nhật trạng thái đơn hàng
app.post('/admin/orders/update/:id', ensureAdmin, (req, res) => {
    const orders = readJSON(ORDERS_PATH);
    const orderId = req.params.id;
    const { status: newStatus } = req.body;

    const order = orders.find(o => o.id === orderId);
    if (!order) return res.redirect('/admin/orders');

    const currentStatus = order.status;

    // ✅ Quy tắc chuyển trạng thái hợp lệ
    const allowedTransitions = {
        pending: ['processing', 'cancelled'],
        processing: ['completed', 'cancelled'],
        completed: [],     // không đổi nữa
        cancelled: []      // không đổi nữa
    };

    if (!allowedTransitions[currentStatus].includes(newStatus)) {
        // Nếu không hợp lệ, giữ nguyên trạng thái
        return res.redirect('/admin/orders');
    }

    // Cập nhật trạng thái
    order.status = newStatus;

    // Nếu hủy đơn, hoàn kho luôn
    if (newStatus === 'cancelled') {
        const orderItems = readJSON(ORDER_ITEMS_PATH);
        const pvData = readJSON(PV_PATH);

        orderItems
            .filter(i => i.order_id === orderId)
            .forEach(i => {
                const pv = pvData.find(v => v.id === i.pv_id);
                if (pv) pv.quantity += i.quantity;
            });

        writeJSON(PV_PATH, pvData);
    }

    writeJSON(ORDERS_PATH, orders);
    res.redirect('/admin/orders');
});


setInterval(() => {
    const orders = readJSON(ORDERS_PATH);
    const now = Date.now();

    orders
        .filter(o => o.status === 'pending' && o.expired_at <= now)
        .forEach(o => autoCancelOrder(o.id));
}, 60 * 1000); // mỗi phút

// ================= START SERVER =================
app.listen( PORT, HOST, () => {
   console.log(`🌾 Farm online: http://${HOST}:${PORT}`);
});
