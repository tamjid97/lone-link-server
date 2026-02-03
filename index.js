// server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 3000;

// Firebase service account
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"], // frontend URL
    credentials: true,
  })
);

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
      const email = req.params.email?.toLowerCase();
      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role || "user" });
    });

    // CREATE NEW USER (POST /users)
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        if (!user?.email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const email = user.email.toLowerCase();

        // Prevent duplicate email
        const existing = await usersCollection.findOne({ email });
        if (existing) {
          return res.status(409).send({ message: "User already exists" });
        }

        const result = await usersCollection.insertOne({
          ...user,
          email,
          createdAt: new Date(),
        });

        res.send({
          message: "User added successfully",
          insertedId: result.insertedId,
        });
      } catch (err) {
        console.error("❌ /users POST error:", err);
        res.status(500).send({ message: "Failed to add user" });
      }
    });

    // Suspend a user (admin action)
    app.patch("/users/suspend/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid user ID" });

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { suspended: true } },
        );

        if (result.matchedCount === 0)
          return res.status(404).send({ message: "User not found" });

        res.send({ message: "User suspended successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to suspend user" });
      }
    });

    // Update user role
    app.patch("/users/role/:id", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid user ID" });
      if (!role) return res.status(400).send({ message: "Role is required" });

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } },
        );

        if (result.matchedCount === 0)
          return res.status(404).send({ message: "User not found" });

        res.send({ message: `User role updated to ${role}` });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update user role" });
      }
    });

    // Get all users
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // ----------------------
    // PAYMENT ROUTE
    // ----------------------
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;

      try {
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
          metadata: {
            loneId: paymentInfo.loneId,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });

        res.send({ url: session.url });
      } catch (err) {
        console.error("❌ Stripe session error:", err);
        res.status(500).send({ message: "Payment session creation failed" });
      }
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
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid Loan ID" });

      const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
      if (!loan) return res.status(404).send({ message: "Loan not found" });
      res.send(loan);
    });

    app.post("/loan", async (req, res) => {
      const loanData = req.body;
      if (!loanData.loanTitle || !loanData.category) {
        return res
          .status(400)
          .send({ message: "Loan title and category are required" });
      }

      try {
        loanData.createdAt = new Date();
        loanData.showOnHome = loanData.showOnHome || false;
        const result = await loanCollection.insertOne(loanData);
        res.send({
          message: "Loan created successfully",
          insertedId: result.insertedId,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to create loan" });
      }
    });

    app.put("/loan/:id", async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid Loan ID" });

      try {
        const result = await loanCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );
        if (result.matchedCount === 0)
          return res.status(404).send({ message: "Loan not found" });

        res.send({ message: "Loan updated successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update loan" });
      }
    });

    app.patch("/loan/show-home/:id", async (req, res) => {
      const { id } = req.params;
      const { showOnHome } = req.body;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid Loan ID" });

      try {
        const result = await loanCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { showOnHome } },
        );
        if (result.matchedCount === 0)
          return res.status(404).send({ message: "Loan not found" });

        res.send({ message: "Loan showOnHome status updated" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update showOnHome" });
      }
    });

    app.delete("/loan/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid Loan ID" });

      try {
        const result = await loanCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0)
          return res.status(404).send({ message: "Loan not found" });

        res.send({ message: "Loan deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to delete loan" });
      }
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

    app.get("/loan-application/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const result = await applicationCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/loan-applications/all", async (req, res) => {
      const applications = await applicationCollection
        .aggregate([
          {
            $lookup: {
              from: "users",
              localField: "userEmail",
              foreignField: "email",
              as: "userInfo",
            },
          },
          { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
        ])
        .toArray();

      const mapped = applications.map((app) => ({
        ...app,
        userName:
          app.userInfo?.name || `${app.firstName || ""} ${app.lastName || ""}`,
      }));

      res.send(mapped);
    });

    app.patch("/loan-application/:id/approve", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Approved", approvedAt: new Date() } },
      );

      if (result.matchedCount === 0)
        return res.status(404).send({ message: "Application not found" });

      res.send({ message: "Application approved successfully" });
    });

    app.patch("/loan-application/:id/reject", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Rejected", rejectedAt: new Date() } },
      );

      if (result.matchedCount === 0)
        return res.status(404).send({ message: "Application not found" });

      res.send({ message: "Application rejected successfully" });
    });

    app.patch("/loan-application/cancel/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Cancelled", cancelledAt: new Date() } },
      );

      if (result.matchedCount === 0)
        return res.status(404).send({ message: "Application not found" });

      res.send({ message: "Application cancelled successfully" });
    });

  } finally {
    // Do not close client
  }
}

run().catch(console.dir);

// Root
app.get("/", (req, res) => res.send("🚀 LoanLink Server Running"));

// Start server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

module.exports = app;
