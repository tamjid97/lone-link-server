// server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 3000;

// Decode Firebase key safely
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

// --------------------
// Middleware
// --------------------
// Allow requests from localhost (dev) and your live frontend
app.use(
  cors({
    origin: ["http://localhost:5173", "https://lonelink-d3167.web.app"],
    credentials: true,
  })
);
app.use(express.json());

// --------------------
// MongoDB Setup
// --------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6gvvest.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let usersCollection, loanCollection, applicationCollection;

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB Connected");

    const db = client.db("loneLinkDB");
    usersCollection = db.collection("users");
    loanCollection = db.collection("loans");
    applicationCollection = db.collection("loanApplications");

    // ----------------------
    // USER ROUTES
    // ----------------------
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email.toLowerCase();
      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role || "user" });
    });

    // ----------------------
    // PAYMENT ROUTE
    // ----------------------
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: 1000,
              product_data: {
                name: paymentInfo.loneName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: { loneId: paymentInfo.loneId },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    // ----------------------
    // LOAN ROUTES
    // ----------------------
    app.get("/loan", async (req, res) => {
      const loans = await loanCollection.find().toArray();
      res.send(loans);
    });

    app.get("/loan/home", async (req, res) => {
      const loans = await loanCollection.find({ showOnHome: true }).toArray();
      res.send(loans);
    });

    app.get("/loan/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid Loan ID" });

      const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
      if (!loan) return res.status(404).send({ message: "Loan not found" });
      res.send(loan);
    });

    // ----------------------
    // LOAN APPLICATION ROUTES
    // ----------------------
    app.post("/loan-application", async (req, res) => {
      const application = {
        ...req.body,
        userEmail: req.body.userEmail?.toLowerCase(),
        status: "Pending",
        createdAt: new Date(),
      };
      const result = await applicationCollection.insertOne(application);
      res.send(result);
    });

    app.get("/loan-applications", async (req, res) => {
      const query = {};
      if (req.query.email) query.userEmail = req.query.email.toLowerCase();
      if (req.query.status) query.status = req.query.status;
      const result = await applicationCollection.find(query).toArray();
      res.send(result);
    });

    // ----------------------
    // ADMIN ROUTES
    // ----------------------
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    app.patch("/users/suspend/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid user ID" });

      try {
        const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { suspended: true } });
        if (result.matchedCount === 0) return res.status(404).send({ message: "User not found" });
        res.send({ message: "User suspended successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to suspend user" });
      }
    });

    app.patch("/users/role/:id", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid user ID" });
      if (!role) return res.status(400).send({ message: "Role is required" });

      try {
        const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
        if (result.matchedCount === 0) return res.status(404).send({ message: "User not found" });
        res.send({ message: `User role updated to ${role}` });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update user role" });
      }
    });

    // Root
    app.get("/", (req, res) => res.send("🚀 LoanLink Server Running"));
  } finally {
    // Keep client alive for serverless
  }
}

run().catch(console.dir);

module.exports = app;
