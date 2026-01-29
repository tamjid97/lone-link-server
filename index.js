const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6gvvest.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully!");

    const db = client.db("loneLinkDB");
    const loneCollection = db.collection("lone");

    // GET all loans
    app.get("/lone", async (req, res) => {
      try {
        const result = await loneCollection.find().toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    // POST add loan
    app.post("/lone", async (req, res) => {
      try {
        const lone = req.body;
        const result = await loneCollection.insertOne(lone);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    // Ping
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment.");
  } catch (err) {
    console.error("❌ MongoDB connection failed", err);
  }
}

// call run
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("loan-link is running");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
