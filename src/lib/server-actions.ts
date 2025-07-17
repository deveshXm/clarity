'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { headers } from 'next/headers';

import { userCollection, accountConfigCollection } from '@/lib/db';
import { AccountConfigFormData, AccountConfigFormDataSchema, ServerActionResult } from '@/types';
import { nowTimestamp } from './utils';

// Helper function to get current user
export async function getCurrentUser() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        throw new Error('Unauthorized');
    }

    return session.user;
}

// Helper function to get user by ID from database
export async function getUserById(userId: string) {
    try {
        const user = await userCollection.findOne({
            _id: new ObjectId(userId)
        });

        return user;
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        throw new Error('Failed to fetch user');
    }
}

// Account Config Management
export async function upsertAccountConfig(rawData: AccountConfigFormData): Promise<ServerActionResult> {
    try {
        const user = await getCurrentUser();
        
        const validatedData = AccountConfigFormDataSchema.parse(rawData);

        await accountConfigCollection.replaceOne(
            { userId: user.id },
            {
                ...validatedData,
                userId: user.id,
                createdAt: nowTimestamp(),
                updatedAt: nowTimestamp()
            },
            { upsert: true }
        );

        // Mark user as having completed onboarding
        await userCollection.updateOne(
            { id: user.id },
            { $set: { hasCompletedOnboarding: true } }
        );

        return { success: true };
    } catch (error) {
        console.error('Error upserting account config:', error);
        
        if (error instanceof z.ZodError) {
            const flattenedErrors = error.flatten().fieldErrors;
            const filteredErrors: Record<string, string[]> = {};
            
            for (const [key, value] of Object.entries(flattenedErrors)) {
                if (value) {
                    filteredErrors[key] = value;
                }
            }
            
            return {
                success: false,
                error: 'Validation failed',
                fieldErrors: filteredErrors
            };
        }

        return {
            success: false,
            error: 'Failed to save account configuration'
        };
    }
}

export async function getAccountConfig(): Promise<ServerActionResult<AccountConfigFormData | null>> {
    try {
        const user = await getCurrentUser();
        
        const accountConfig = await accountConfigCollection.findOne({
            userId: user.id
        });

        if (!accountConfig) {
            return { success: true, data: null };
        }

        const serializedConfig: AccountConfigFormData = {
            companyName: accountConfig.companyName,
            websiteUrl: accountConfig.websiteUrl,
        };

        return { success: true, data: serializedConfig };
    } catch (error) {
        console.error('Error fetching account config:', error);
        return {
            success: false,
            error: 'Failed to fetch account configuration'
        };
    }
}
