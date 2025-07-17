import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import client from "./db";

export const auth = betterAuth({
    database: mongodbAdapter(client.db("answerable")),
    socialProviders: {
        google: {
            prompt: "select_account",
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
    },
    user: {
        additionalFields: {
            hasCompletedOnboarding: {
                type: "boolean",
                defaultValue: false,
            },
        },
    },
}); 