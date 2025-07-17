import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {

    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session) {
        redirect('/login');
    }

    return (
        <div className="min-h-screen bg-white">
            {children}
        </div>
    );
} 