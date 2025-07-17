import { betterFetch } from "@better-fetch/fetch";
import { NextRequest, NextResponse } from "next/server";
import { User } from "./types";
 
type Session = {
	user: {
		id: string;
		email: string;
		name: string;
	};
	session: {
		id: string;
		userId: string;
		expiresAt: Date;
	};
};

export async function middleware(request: NextRequest) {
	const { data: session } = await betterFetch<Session>("/api/auth/get-session", {
		baseURL: request.nextUrl.origin,
		headers: {
			cookie: request.headers.get("cookie") || "", // Forward the cookies from the request
		},
	});

	if (!session) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	// Get user data from our API to check onboarding status
	const { data: userData } = await betterFetch<User>("/api/user", {
		baseURL: request.nextUrl.origin,
		headers: {
			cookie: request.headers.get("cookie") || "", // Forward the cookies from the request
		},
	});

	// Handle onboarding redirect
	const pathname = request.nextUrl.pathname;
	const hasCompletedOnboarding = userData?.hasCompletedOnboarding || false;

	// Only redirect to onboarding if user hasn't completed it AND they're not already on the onboarding page
	if (!hasCompletedOnboarding && !pathname.startsWith('/app/onboarding')) {
		return NextResponse.redirect(new URL("/app/onboarding", request.url));
	}

  if (hasCompletedOnboarding && pathname.startsWith('/app/onboarding')) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

	return NextResponse.next();
}

export const config = {
	matcher: ["/app/:path*"], // Apply middleware to all /app routes
};