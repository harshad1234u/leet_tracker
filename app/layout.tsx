import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "LeetHabit", description: "One LeetCode problem, every day." };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
