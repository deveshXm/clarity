import { MongoClient, ServerApiVersion } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

let client: MongoClient;

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongo = global as typeof globalThis & {
    _mongoClient?: MongoClient;
  };

  if (!globalWithMongo._mongoClient) {
    globalWithMongo._mongoClient = new MongoClient(uri, options);
  }
  client = globalWithMongo._mongoClient;
} else {
  client = new MongoClient(uri, options);
}

export const db = client.db(process.env.MONGODB_DB_NAME);
export default client; 

// Workspace-wide app collections
export const workspaceCollection = db.collection("workspaces"); // Workspace data with subscription
export const slackUserCollection = db.collection("slackUsers"); // User preferences only
export const botChannelsCollection = db.collection("botChannels"); // Channels bot is active in
export const analysisInstanceCollection = db.collection("analysisInstances"); // Message analysis data
export const feedbackCollection = db.collection("feedback"); // User feedback
