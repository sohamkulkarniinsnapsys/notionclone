"use client";

import { useEffect } from "react";
import { initPerformanceMonitoring, startPerformanceSession } from "@/lib/performance";

/**
 * Performance Monitor Component
 * Initializes performance tracking and Core Web Vitals monitoring
 */
export default function PerformanceMonitor() {
  useEffect(() => {
    // Initialize performance monitoring
    initPerformanceMonitoring({
      enabled: true,
      reportToAnalytics: process.env.NODE_ENV === "production",
      logToConsole: process.env.NODE_ENV === "development",
      sampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0, // Sample 10% in production
    });

    // Start performance session tracking
    startPerformanceSession();

    // Log initial performance metrics
    if (process.env.NODE_ENV === "development") {
      console.log("🚀 Performance monitoring initialized");
    }
  }, []);

  return null; // This component doesn't render anything
}
