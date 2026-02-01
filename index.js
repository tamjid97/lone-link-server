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
    origin: ["http://localhost:5173"], // frontend URL
    credentials: true,
  })
);

// MongoDB Setup
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
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const email = user.email?.toLowerCase();
      if (!email) return res.status(400).send({ message: "Email required" });

      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            name: user.name,
            email,
            role: user.role || "user",
            photoURL: user.photoURL,
            suspended: false,
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

    app.patch("/users/role/:id", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    app.patch("/users/suspend/:id", async (req, res) => {
      const { id } = req.params;
      const { suspended } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { suspended: !!suspended, suspendedAt: suspended ? new Date() : null } }
      );
      res.send(result);
    });

    // ----------------------
    // LOAN ROUTES
    // ----------------------
    app.get("/loan/home", async (req, res) => {
      const result = await loanCollection.find({ showOnHome: true }).toArray();
      res.send(result);
    });

    app.get("/loan", async (req, res) => {
      const result = await loanCollection.find().toArray();
      res.send(result);
    });

    app.get("/loan/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid Loan ID" });
      const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
      if (!loan) return res.status(404).send({ message: "Loan not found" });
      res.send(loan);
    });

    app.put("/loan/:id", async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid loan ID" });
      const result = await loanCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
      if (result.matchedCount === 0) return res.status(404).send({ message: "Loan not found" });
      res.send({ message: "Loan updated successfully" });
    });

    app.delete("/loan/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid loan ID" });
      const result = await loanCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) return res.status(404).send({ message: "Loan not found" });
      res.send({ message: "Loan deleted successfully" });
    });

    app.patch("/loan/show-home/:id", async (req, res) => {
      const { id } = req.params;
      const { showOnHome } = req.body;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid loan ID" });
      const result = await loanCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { showOnHome: !!showOnHome } }
      );
      if (result.matchedCount === 0) return res.status(404).send({ message: "Loan not found" });
      res.send({ message: "Show on home updated successfully" });
    });

    // ----------------------
    // LOAN APPLICATION ROUTES
    // ----------------------
    // Apply
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

    // User sees their own applications
    app.get("/loan-applications/user", async (req, res) => {
      const email = req.query.email?.toLowerCase();
      if (!email) return res.send([]);
      const result = await applicationCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    // Admin sees all applications
    app.get("/loan-applications", async (req, res) => {
      const applications = await applicationCollection
        .aggregate([
          { $lookup: { from: "users", localField: "userEmail", foreignField: "email", as: "userInfo" } },
          { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
        ])
        .toArray();

      const mapped = applications.map(app => ({
        ...app,
        userName: app.userInfo?.name || `${app.firstName || ""} ${app.lastName || ""}`
      }));

      res.send(mapped);
    });

    // Approve loan
    app.patch("/loan-application/:id/approve", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Approved", approvedAt: new Date() } }
      );

      if (result.matchedCount === 0) return res.status(404).send({ message: "Application not found" });
      res.send({ message: "Application approved successfully" });
    });

    // Reject loan
    app.patch("/loan-application/:id/reject", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Rejected", rejectedAt: new Date() } }
      );

      if (result.matchedCount === 0) return res.status(404).send({ message: "Application not found" });
      res.send({ message: "Application rejected successfully" });
    });

    // Cancel loan
    app.patch("/loan-application/cancel/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Cancelled", cancelledAt: new Date() } }
      );
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("📡 MongoDB Ping Success");
  } finally {}
}

run().catch(console.dir);

// Root
app.get("/", (req, res) => res.send("🚀 LoanLink Server Running"));

// Start server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
