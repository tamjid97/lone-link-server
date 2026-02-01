const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
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

let usersCollection;
let loanCollection;
let applicationCollection;

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB Connected");

    const db = client.db("loneLinkDB");
    usersCollection = db.collection("users");
    loanCollection = db.collection("loans"); // MASTER LOANS
    applicationCollection = db.collection("loanApplications"); // USER APPLICATIONS

    // --------------------
    // USER ROUTES
    // --------------------
    app.post("/users", async (req, res) => {
      const user = req.body;
      if (!user?.email) {
        return res.status(400).send({ message: "Email required" });
      }

      const email = user.email.toLowerCase();
      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            name: user.name,
            email,
            role: user.role || "user",
            photoURL: user.photoURL,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );

      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email.toLowerCase();
      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role || "user" });
    });

    // --------------------
    // LOAN ROUTES (MASTER)
    // --------------------

    // ✅ Home page loans
    app.get("/loan/home", async (req, res) => {
      const result = await loanCollection.find({ showOnHome: true }).toArray();
      res.send(result);
    });

    // ✅ Get all loans (admin)
    app.get("/loan", async (req, res) => {
      const result = await loanCollection.find().toArray();
      res.send(result);
    });

    // ✅ Get single loan details
    app.get("/loan/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Loan ID" });
        }

        const loan = await loanCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!loan) {
          return res.status(404).send({ message: "Loan not found" });
        }

        res.send(loan);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch loan" });
      }
    });

    // --------------------
    // LOAN APPLICATION ROUTES
    // --------------------
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
      const result = await applicationCollection.find().toArray();
      res.send(result);
    });

    app.get("/loan-applications/pending", async (req, res) => {
      const result = await applicationCollection
        .find({ status: "Pending" })
        .toArray();
      res.send(result);
    });

    app.patch("/loan-application/:id/approve", async (req, res) => {
      const { id } = req.params;

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Approved", approvedAt: new Date() } }
      );

      res.send(result);
    });

    app.patch("/loan-application/:id/reject", async (req, res) => {
      const { id } = req.params;

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Rejected" } }
      );

      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("📡 MongoDB Ping Success");
  } finally {
  }
}

run().catch(console.dir);

// --------------------
app.get("/", (req, res) => {
  res.send("🚀 LoanLink Server Running");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
