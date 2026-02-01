// server.js
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
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
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
    // Create application
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

    // Get applications (filter by email + status)
    app.get("/loan-applications", async (req, res) => {
      const query = {};
      if (req.query.email) query.userEmail = req.query.email.toLowerCase();
      if (req.query.status) query.status = req.query.status;

      const result = await applicationCollection.find(query).toArray();
      res.send(result);
    });

    // ----------------------
// GET ALL USERS (Admin)
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



// Suspend a user (admin action)
app.patch("/users/suspend/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid user ID" });

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { suspended: true } }
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

  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid user ID" });
  if (!role) return res.status(400).send({ message: "Role is required" });

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role } }
    );

    if (result.matchedCount === 0) return res.status(404).send({ message: "User not found" });

    res.send({ message: `User role updated to ${role}` });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update user role" });
  }
});



    // Admin sees all applications
    app.get("/loan-applications/all", async (req, res) => {
      const applications = await applicationCollection
        .aggregate([
          { $lookup: { from: "users", localField: "userEmail", foreignField: "email", as: "userInfo" } },
          { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
        ])
        .toArray();

      const mapped = applications.map((app) => ({
        ...app,
        userName: app.userInfo?.name || `${app.firstName || ""} ${app.lastName || ""}`,
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

      if (result.matchedCount === 0)
        return res.status(404).send({ message: "Application not found" });

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

      if (result.matchedCount === 0)
        return res.status(404).send({ message: "Application not found" });

      res.send({ message: "Application rejected successfully" });
    });


// Update loan info
app.put("/loan/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid Loan ID" });

  try {
    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) return res.status(404).send({ message: "Loan not found" });

    res.send({ message: "Loan updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update loan" });
  }
});


// Toggle showOnHome
app.patch("/loan/show-home/:id", async (req, res) => {
  const { id } = req.params;
  const { showOnHome } = req.body;

  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid Loan ID" });

  try {
    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { showOnHome } }
    );

    if (result.matchedCount === 0) return res.status(404).send({ message: "Loan not found" });

    res.send({ message: "Loan showOnHome status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update showOnHome" });
  }
});


// Delete loan
app.delete("/loan/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid Loan ID" });

  try {
    const result = await loanCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) return res.status(404).send({ message: "Loan not found" });

    res.send({ message: "Loan deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to delete loan" });
  }
});


// Create new loan
app.post("/loan", async (req, res) => {
  const loanData = req.body;

  if (!loanData.loanTitle || !loanData.category) {
    return res.status(400).send({ message: "Loan title and category are required" });
  }

  try {
    // Default fields
    loanData.createdAt = new Date();
    loanData.showOnHome = loanData.showOnHome || false;

    const result = await loanCollection.insertOne(loanData);
    res.send({ message: "Loan created successfully", insertedId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create loan" });
  }
});


    // Cancel loan
    app.patch("/loan-application/cancel/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Cancelled", cancelledAt: new Date() } }
      );

      if (result.matchedCount === 0)
        return res.status(404).send({ message: "Application not found" });

      res.send({ message: "Application cancelled successfully" });
    });

    await client.db("admin").command({ ping: 1 });
    console.log("📡 MongoDB Ping Success");

  } finally {
    // Do not close client
  }
}

run().catch(console.dir);

// Root
app.get("/", (req, res) => res.send("🚀 LoanLink Server Running"));

// Start server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
