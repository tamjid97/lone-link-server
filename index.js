// index.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"], // আপনার frontend url
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
  tls: true,
  tlsAllowInvalidCertificates: true, // DEV only
});

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected");

    const db = client.db("loneLinkDB");
    const usersCollection = db.collection("users");
    const loanCollection = db.collection("loans");
    const applicationCollection = db.collection("loanApplications");

    // =====================
    // USER ROUTES
    // =====================

    // Create/Update user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user.email)
          return res.status(400).send({ message: "Email is required" });

        const email = user.email.toLowerCase();
        const filter = { email };
        const update = {
          $set: {
            name: user.name,
            email,
            role: user.role || "user", // default role
            photoURL: user.photoURL,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        };
        const options = { upsert: true };
        const result = await usersCollection.updateOne(filter, update, options);
        res.status(201).send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to save user" });
      }
    });

    // Get all users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // Get user by ID
    app.get("/users/:id", async (req, res) => {
      try {
        const user = await usersCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!user) return res.status(404).send({ message: "User not found" });
        res.send(user);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch user" });
      }
    });

    // Get role by email
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email.toLowerCase();
        const user = await usersCollection.findOne({ email });
        res.send({ role: user?.role || "user" });
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch role" });
      }
    });

// =====================
// UPDATE USER ROLE (ADMIN)
// =====================
app.patch("/users/role/:id", async (req, res) => {
  try {
    const { role } = req.body;

    // only allow user or manager
    if (!["user", "manager"].includes(role)) {
      return res.status(400).send({ message: "Invalid role" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "User not found" });
    }

    res.send({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update role" });
  }
});



    // =====================
    // LOAN ROUTES
    // =====================

    // Get all loans (optional filter by user email)
    app.get("/loan", async (req, res) => {
      const email = req.query.email?.toLowerCase();
      const query = email ? { "createdBy.email": email } : {};
      const loans = await loanCollection.find(query).toArray();
      res.send(loans);
    });

    // Get loan by ID
    app.get("/loan/:id", async (req, res) => {
      const loan = await loanCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!loan) return res.status(404).send({ message: "Loan not found" });
      res.send(loan);
    });

    // Add new loan
    app.post("/loan", async (req, res) => {
      const loan = {
        ...req.body,
        createdBy: {
          name: req.body.createdBy?.name,
          email: req.body.createdBy?.email?.toLowerCase(),
        },
        showOnHome: !!req.body.showOnHome,
        createdAt: new Date(),
      };
      const result = await loanCollection.insertOne(loan);
      res.status(201).send(result);
    });

    // Update loan
    app.put("/loan/:id", async (req, res) => {
      const result = await loanCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
      if (!result.matchedCount)
        return res.status(404).send({ message: "Loan not found" });
      res.send({ success: true });
    });

    // Delete loan
    app.delete("/loan/:id", async (req, res) => {
      const result = await loanCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // =====================
    // LOAN APPLICATION ROUTES
    // =====================

    // Apply for loan
    app.post("/loan-application", async (req, res) => {
      const application = {
        ...req.body,
        userEmail: req.body.userEmail?.toLowerCase(),
        status: "Pending",
        createdAt: new Date(),
      };
      const result = await applicationCollection.insertOne(application);
      res.status(201).send(result);
    });

    // Get applications by user email
    app.get("/loan-application", async (req, res) => {
      const email = req.query.email?.toLowerCase();
      if (!email) return res.status(400).send({ message: "Email required" });

      const result = await applicationCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    // Cancel application
    app.patch("/loan-application/cancel/:id", async (req, res) => {
      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(req.params.id), status: "Pending" },
        { $set: { status: "Cancelled" } }
      );
      res.send(result);
    });

    // Get all applications (admin)
    app.get("/loan-applications", async (req, res) => {
      const result = await applicationCollection.find().toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("📡 MongoDB ping success");
  } catch (err) {
    console.error("❌ MongoDB error", err);
  }
}

run();

// Test root
app.get("/", (req, res) => {
  res.send("🚀 LoanLink server running");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});