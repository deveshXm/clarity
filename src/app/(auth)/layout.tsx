import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {

    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (session) {
        redirect('/app');
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {children}
        </div>
    );
} 