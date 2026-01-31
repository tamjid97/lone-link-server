const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"], // Frontend URL
    credentials: true,
  })
);

// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6gvvest.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

let usersCollection, loanCollection, applicationCollection;

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected");

    const db = client.db("loneLinkDB");
    usersCollection = db.collection("users");
    loanCollection = db.collection("loans"); // Loan master collection
    applicationCollection = db.collection("loanApplications"); // User applications

    // ----------------------
    // USER ROUTES
    // ----------------------
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user.email) return res.status(400).send({ message: "Email is required" });

        const email = user.email.toLowerCase();
        const filter = { email };
        const update = {
          $set: {
            name: user.name,
            email,
            role: user.role || "user",
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

    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email.toLowerCase();
        const user = await usersCollection.findOne({ email });
        res.send({ role: user?.role || "user" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch role" });
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
      res.status(201).send(result);
    });

    app.get("/loan-applications", async (req, res) => {
      const result = await applicationCollection.find().toArray();
      res.send(result);
    });

    app.get("/loan-applications/pending", async (req, res) => {
      const result = await applicationCollection.find({ status: "Pending" }).toArray();
      res.send(result);
    });

    app.patch("/loan-application/:id/approve", async (req, res) => {
      const id = req.params.id;
      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Approved", approvedAt: new Date() } }
      );
      if (result.modifiedCount > 0) res.send({ message: "Loan approved successfully" });
      else res.status(404).send({ message: "Loan not found" });
    });

    app.patch("/loan-application/:id/reject", async (req, res) => {
      const id = req.params.id;
      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Rejected" } }
      );
      if (result.modifiedCount > 0) res.send({ message: "Loan rejected successfully" });
      else res.status(404).send({ message: "Loan not found" });
    });

    // ----------------------
    // LOAN ROUTES
    // ----------------------

    // Get home page approved loans
    app.get("/loan/home", async (req, res) => {
      try {
        const approvedLoans = await applicationCollection.find({ status: "Approved" }).toArray();
        res.send(approvedLoans);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch home loans" });
      }
    });

    // Get all loans (admin)
    app.get("/loan", async (req, res) => {
      const result = await loanCollection.find().toArray();
      res.send(result);
    });

    // Get single loan by ID (for DetailsLone)
    app.get("/loan/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const loan = await applicationCollection.findOne({ _id: new ObjectId(id) });
        if (!loan) return res.status(404).send({ message: "Loan not found" });
        res.send(loan);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch loan" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("📡 MongoDB ping success");
  } catch (err) {
    console.error("❌ MongoDB error", err);
  }
}

run().catch(console.dir);

// Root
app.get("/", (req, res) => res.send("🚀 LoanLink server running"));

// Start server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
