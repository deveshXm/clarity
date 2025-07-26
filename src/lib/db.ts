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

// Basic collections (for boilerplate)
export const userCollection = db.collection("user");
export const accountConfigCollection = db.collection("accountConfig");

// Slack app collections
export const workspaceCollection = db.collection("workspaces");
export const slackUserCollection = db.collection("slackUsers");
export const analysisInstanceCollection = db.collection("analysisInstances");
export const invitationCollection = db.collection("invitations");
export const botChannelsCollection = db.collection("botChannels");
