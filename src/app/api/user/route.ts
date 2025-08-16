import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getUserById } from "@/lib/server-actions";
import { trackError } from '@/lib/posthog';
import { logError, logInfo } from '@/lib/logger';

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await getUserById(session.user.id);
        
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        logInfo('User data retrieved successfully', { 
            user_id: session.user.id,
            endpoint: '/api/user'
        });

        return NextResponse.json(user);
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error fetching user data', errorObj, { endpoint: '/api/user' });
        trackError('anonymous', errorObj, { 
            endpoint: '/api/user',
            operation: 'get_user_data'
        });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
} 