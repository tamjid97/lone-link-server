const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6gvvest.mongodb.net/?appName=Cluster0`;

// MongoClient with TLS fix for development
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  tls: true,
  tlsAllowInvalidCertificates: true, // ✅ ONLY FOR DEVELOPMENT
});

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully!");

    const db = client.db("loneLinkDB");
    const loanCollection = db.collection("loans");
    const applicationCollection = db.collection("loanApplications");

    // ---------------------------------------------
    // 1️⃣ GET all loans
    app.get("/loan", async (req, res) => {
      const result = await loanCollection.find().toArray();
      res.send(result);
    });

    // ---------------------------------------------
    // 2️⃣ GET single loan by ID
    app.get("/loan/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
        if (!loan) return res.status(404).send({ message: "Loan not found" });
        res.send(loan);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // ---------------------------------------------
    // 3️⃣ POST add new loan
    app.post("/loan", async (req, res) => {
      const loan = req.body;
      const result = await loanCollection.insertOne(loan);
      res.send(result);
    });

    // ---------------------------------------------
    // 4️⃣ POST submit loan application
    app.post("/loan-application", async (req, res) => {
      const application = req.body;
      try {
        const result = await applicationCollection.insertOne(application);
        res.status(201).send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to submit loan application" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment.");
  } catch (err) {
    console.error("❌ MongoDB connection failed", err);
  }
}

run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("loan-link is running");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
