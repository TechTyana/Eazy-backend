const express = require('express');
const cors = require('cors');
const { initDB, Product, Order, OrderItem, Refund, User } = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Products API
app.get('/api/products', async (req, res) => {
  try {
    const { search, category } = req.query;
    const where = {};
    if (search) {
      where.name = { [require('sequelize').Op.like]: `%${search}%` };
    }
    if (category) {
      where.category = category;
    }
    const products = await Product.findAll({ where });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Order & Checkout
app.post('/api/orders/checkout', async (req, res) => {
  try {
    const { items, shipping_address } = req.body;
    // items should be [{ productId: 1, quantity: 2 }, ...]
    if (!items || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    let total_amount = 0;
    const orderItemsData = [];

    // Verify products and calculate total
    for (const item of items) {
      const product = await Product.findByPk(item.productId);
      if (!product) return res.status(404).json({ error: `Product ${item.productId} not found` });
      
      const itemPrice = product.price;
      total_amount += itemPrice * item.quantity;
      
      orderItemsData.push({
        ProductId: product.id,
        quantity: item.quantity,
        price: itemPrice
      });
    }

    // Add mock tax (e.g. 10%)
    total_amount = total_amount * 1.1;

    // A real system would use a transaction here
    const order = await Order.create({
      total_amount: total_amount.toFixed(2),
      status: 'pending',
      shipping_address: shipping_address || 'Default Address'
    });

    for (const oi of orderItemsData) {
      await OrderItem.create({
        ...oi,
        OrderId: order.id
      });
    }

    res.json({ message: 'Checkout successful', orderId: order.id, total_amount: order.total_amount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List orders (Mock for current user)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.findAll({ include: [OrderItem, Refund], order: [['createdAt', 'DESC']] });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Order tracking
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, {
      include: [OrderItem, Refund]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Mark Delivered
app.put('/api/orders/:id/delivery', async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.status = 'delivered';
    await order.save();
    res.json({ message: 'Order marked as delivered', order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refunds API
app.post('/api/refunds', async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    
    // Check if order exists and is delivered
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'delivered') return res.status(400).json({ error: 'Only delivered orders can be refunded' });

    const refund = await Refund.create({
      OrderId: orderId,
      reason
    });
    
    res.json({ message: 'Refund requested successfully', refund });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin View Refunds
app.get('/api/refunds', async (req, res) => {
  try {
    const refunds = await Refund.findAll({ include: [Order] });
    res.json(refunds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Add Product
app.post('/api/products', async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await initDB();
  
  // Seed initial products if none exist
  const count = await Product.count();
  if (count === 0) {
    await Product.bulkCreate([
      { name: 'Wireless Headphones', description: 'High quality noise-canceling headphones', category: 'Electronics', price: 199.99, image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80' },
      { name: 'Smartwatch', description: 'Track your fitness and notifications', category: 'Electronics', price: 149.50, image_url: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=500&q=80' },
      { name: 'Running Shoes', description: 'Comfortable shoes for daily running', category: 'Apparel', price: 89.99, image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=80' },
      { name: 'Mechanical Keyboard', description: 'RGB mechanical keyboard with tactile switches', category: 'Accessories', price: 129.99, image_url: 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=500&q=80' }
    ]);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
