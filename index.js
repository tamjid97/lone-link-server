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

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  tls: true,
  tlsAllowInvalidCertificates: true, // DEV only
});

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully!");

    const db = client.db("loneLinkDB");
    const loanCollection = db.collection("loans");
    const applicationCollection = db.collection("loanApplications");

    // -----------------------------
    // LOAN ROUTES
    // -----------------------------

    // Get all loans or filter by user email
    app.get("/loan", async (req, res) => {
      try {
        const email = req.query.email?.toLowerCase();
        const query = email ? { "createdBy.email": email } : {};
        const loans = await loanCollection.find(query).toArray();
        res.send(loans);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch loans" });
      }
    });

    // Get single loan
    app.get("/loan/:id", async (req, res) => {
      try {
        const loan = await loanCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!loan) return res.status(404).send({ message: "Loan not found" });
        res.send(loan);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Add new loan
    app.post("/loan", async (req, res) => {
      try {
        const loan = {
          ...req.body,
          createdBy: {
            name: req.body.createdBy?.name || "Unknown",
            email: req.body.createdBy?.email?.toLowerCase() || "",
          },
          showOnHome: !!req.body.showOnHome,
          createdAt: new Date(),
        };
        const result = await loanCollection.insertOne(loan);
        res.status(201).send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to add loan" });
      }
    });

    // Update loan (for modal edit)
    app.put("/loan/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedLoan = req.body;

        const result = await loanCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedLoan }
        );

        if (result.matchedCount === 0) return res.status(404).send({ message: "Loan not found" });
        res.send({ success: true, message: "Loan updated successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update loan" });
      }
    });

    // Update Show on Home toggle
    app.patch("/loan/show-home/:id", async (req, res) => {
      const { showOnHome } = req.body;
      try {
        const result = await loanCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { showOnHome } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update showOnHome" });
      }
    });

    // Delete loan
    app.delete("/loan/:id", async (req, res) => {
      try {
        const result = await loanCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to delete loan" });
      }
    });

    // -----------------------------
    // LOAN APPLICATION ROUTES
    // -----------------------------

    // Submit loan application
    app.post("/loan-application", async (req, res) => {
      try {
        const application = {
          ...req.body,
          userEmail: req.body.userEmail?.toLowerCase(),
          status: "Pending",
          createdAt: new Date(),
        };
        const result = await applicationCollection.insertOne(application);
        res.status(201).send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to submit application" });
      }
    });

    // Get user's loan applications
    app.get("/loan-application", async (req, res) => {
      const email = req.query.email?.toLowerCase();
      if (!email) return res.status(400).send({ message: "Email query required" });
      const result = await applicationCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    // Cancel loan application (Pending only)
    app.patch("/loan-application/cancel/:id", async (req, res) => {
      try {
        const result = await applicationCollection.updateOne(
          { _id: new ObjectId(req.params.id), status: "Pending" },
          { $set: { status: "Cancelled" } }
        );
        if (result.modifiedCount === 0)
          return res.status(400).send({ message: "Cannot cancel application" });
        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to cancel application" });
      }
    });

    // Approve / Reject loan application (Admin)
    app.patch("/loan-application/status/:id", async (req, res) => {
      const { status } = req.body;
      if (!["Approved", "Rejected"].includes(status))
        return res.status(400).send({ message: "Invalid status" });
      try {
        const result = await applicationCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update status" });
      }
    });

    // Get all loan applications (Admin)
    app.get("/loan-applications", async (req, res) => {
      const result = await applicationCollection.find().toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("📡 MongoDB ping success");
  } catch (err) {
    console.error("❌ MongoDB connection failed", err);
  }
}

run().catch(console.dir);

// Root
app.get("/", (req, res) => res.send("🚀 Loan-Link server is running"));

// Start server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
