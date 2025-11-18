/**
 * Performance Monitoring Utility
 * Tracks Core Web Vitals and other performance metrics
 */

import { Metric } from "web-vitals";

// Type definitions
interface LayoutShift extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory: PerformanceMemory;
}

interface NetworkInformation {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}

// Types for performance metrics
export interface PerformanceMetrics {
  FCP?: number; // First Contentful Paint
  LCP?: number; // Largest Contentful Paint
  FID?: number; // First Input Delay
  CLS?: number; // Cumulative Layout Shift
  TTFB?: number; // Time to First Byte
  INP?: number; // Interaction to Next Paint
}

export interface PerformanceConfig {
  enabled: boolean;
  reportToAnalytics?: boolean;
  logToConsole?: boolean;
  sampleRate?: number; // 0-1, percentage of sessions to track
}

const defaultConfig: PerformanceConfig = {
  enabled: process.env.NODE_ENV === "production",
  reportToAnalytics: false,
  logToConsole: process.env.NODE_ENV === "development",
  sampleRate: 1.0,
};

// Store metrics
const metrics: PerformanceMetrics = {};

/**
 * Report metric to analytics service
 */
function reportToAnalytics(metric: Metric) {
  // Send to your analytics service (e.g., Google Analytics, Vercel Analytics)
  if (
    typeof window !== "undefined" &&
    (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
  ) {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
      "event",
      metric.name,
      {
        value: Math.round(
          metric.name === "CLS" ? metric.value * 1000 : metric.value,
        ),
        event_category: "Web Vitals",
        event_label: metric.id,
        non_interaction: true,
      },
    );
  }

  // Send to custom analytics endpoint
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT) {
    fetch(process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: metric.name,
        value: metric.value,
        id: metric.id,
        timestamp: Date.now(),
        url: window.location.href,
      }),
      keepalive: true,
    }).catch((error) => {
      console.error("Failed to send analytics:", error);
    });
  }
}

/**
 * Format metric value for display
 */
function formatMetricValue(metric: Metric): string {
  const value = metric.value;
  if (metric.name === "CLS") {
    return value.toFixed(3);
  }
  return `${Math.round(value)}ms`;
}

/**
 * Get metric rating (good, needs improvement, poor)
 */
function getMetricRating(
  metric: Metric,
): "good" | "needs-improvement" | "poor" {
  const thresholds: Record<string, { good: number; needsImprovement: number }> =
    {
      FCP: { good: 1800, needsImprovement: 3000 },
      LCP: { good: 2500, needsImprovement: 4000 },
      FID: { good: 100, needsImprovement: 300 },
      CLS: { good: 0.1, needsImprovement: 0.25 },
      TTFB: { good: 800, needsImprovement: 1800 },
      INP: { good: 200, needsImprovement: 500 },
    };

  const threshold = thresholds[metric.name];
  if (!threshold) return "good";

  if (metric.value <= threshold.good) return "good";
  if (metric.value <= threshold.needsImprovement) return "needs-improvement";
  return "poor";
}

/**
 * Log metric to console
 */
function logMetric(metric: Metric, config: PerformanceConfig) {
  if (!config.logToConsole) return;

  const rating = getMetricRating(metric);
  const color =
    rating === "good"
      ? "#10b981"
      : rating === "needs-improvement"
        ? "#f59e0b"
        : "#ef4444";

  console.log(
    `%c⚡ ${metric.name}: ${formatMetricValue(metric)} (${rating})`,
    `color: ${color}; font-weight: bold;`,
  );
}

/**
 * Handle metric reporting
 */
function handleMetric(metric: Metric, config: PerformanceConfig) {
  // Store metric
  metrics[metric.name as keyof PerformanceMetrics] = metric.value;

  // Apply sample rate
  if (Math.random() > (config.sampleRate || 1)) return;

  // Log to console
  logMetric(metric, config);

  // Report to analytics
  if (config.reportToAnalytics) {
    reportToAnalytics(metric);
  }
}

/**
 * Initialize performance monitoring
 */
export async function initPerformanceMonitoring(
  config: Partial<PerformanceConfig> = {},
) {
  const finalConfig = { ...defaultConfig, ...config };

  if (!finalConfig.enabled || typeof window === "undefined") {
    return;
  }

  try {
    // Dynamically import web-vitals to reduce initial bundle size
    const { onCLS, onFCP, onFID, onLCP, onTTFB, onINP } = await import(
      "web-vitals"
    );

    // Track Core Web Vitals
    onCLS((metric) => handleMetric(metric, finalConfig));
    onFCP((metric) => handleMetric(metric, finalConfig));
    onFID((metric) => handleMetric(metric, finalConfig));
    onLCP((metric) => handleMetric(metric, finalConfig));
    onTTFB((metric) => handleMetric(metric, finalConfig));
    onINP((metric) => handleMetric(metric, finalConfig));
  } catch (error) {
    console.error("Failed to initialize performance monitoring:", error);
  }
}

/**
 * Get current metrics
 */
export function getMetrics(): PerformanceMetrics {
  return { ...metrics };
}

/**
 * Track custom performance mark
 */
export function mark(name: string) {
  if (typeof window === "undefined" || !window.performance) return;
  window.performance.mark(name);
}

/**
 * Measure time between two marks
 */
export function measure(name: string, startMark: string, endMark?: string) {
  if (typeof window === "undefined" || !window.performance) return;

  try {
    if (endMark) {
      window.performance.measure(name, startMark, endMark);
    } else {
      window.performance.measure(name, startMark);
    }

    const measures = window.performance.getEntriesByName(name, "measure");
    if (measures.length > 0) {
      const duration = measures[measures.length - 1].duration;
      console.log(`⏱️ ${name}: ${Math.round(duration)}ms`);
      return duration;
    }
  } catch (error) {
    console.error(`Failed to measure ${name}:`, error);
  }
}

/**
 * Track resource timing
 */
export function trackResourceTiming() {
  if (typeof window === "undefined" || !window.performance) return;

  const resources = window.performance.getEntriesByType("resource");
  const summary = {
    totalResources: resources.length,
    totalSize: 0,
    totalDuration: 0,
    byType: {} as Record<
      string,
      { count: number; size: number; duration: number }
    >,
  };

  resources.forEach((resource: PerformanceResourceTiming) => {
    const type = resource.initiatorType || "other";
    const size = resource.transferSize || 0;
    const duration = resource.duration || 0;

    if (!summary.byType[type]) {
      summary.byType[type] = { count: 0, size: 0, duration: 0 };
    }

    summary.byType[type].count++;
    summary.byType[type].size += size;
    summary.byType[type].duration += duration;
    summary.totalSize += size;
    summary.totalDuration += duration;
  });

  console.table(
    Object.entries(summary.byType).map(([type, stats]) => ({
      Type: type,
      Count: stats.count,
      "Size (KB)": (stats.size / 1024).toFixed(2),
      "Duration (ms)": Math.round(stats.duration),
    })),
  );

  return summary;
}

/**
 * Track long tasks (with aggressive throttling to reduce overhead)
 */
export function trackLongTasks() {
  if (typeof window === "undefined" || !window.PerformanceObserver) {
    return;
  }

  let lastLogTime = 0;
  const LOG_THROTTLE_MS = 30000; // Only log every 30 seconds to reduce overhead
  let taskCount = 0;
  let totalDuration = 0;
  let longestDuration = 0;

  try {
    const observer = new PerformanceObserver((list) => {
      const now = Date.now();
      const entries = list.getEntries();

      // Accumulate stats without logging
      taskCount += entries.length;
      entries.forEach((entry) => {
        totalDuration += entry.duration;
        if (entry.duration > longestDuration) {
          longestDuration = entry.duration;
        }
      });

      // Only log if enough time has passed AND we have significant tasks
      if (now - lastLogTime > LOG_THROTTLE_MS && taskCount > 0) {
        const avgDuration = Math.round(totalDuration / taskCount);
        console.warn(
          `⚠️ ${taskCount} Long Tasks (avg: ${avgDuration}ms, max: ${Math.round(longestDuration)}ms)`,
        );
        // Reset counters
        taskCount = 0;
        totalDuration = 0;
        longestDuration = 0;
        lastLogTime = now;
      }
    });

    observer.observe({ entryTypes: ["longtask"] });
  } catch (error) {
    console.error("Failed to observe long tasks:", error);
  }
}

/**
 * Track layout shifts (with aggressive throttling to reduce overhead)
 */
export function trackLayoutShifts() {
  if (typeof window === "undefined" || !window.PerformanceObserver) {
    return;
  }

  let clsValue = 0;
  let sessionValue = 0;
  let shiftCount = 0;
  let lastLogTime = 0;
  const LOG_THROTTLE_MS = 30000; // Only log every 30 seconds to reduce overhead

  try {
    const observer = new PerformanceObserver((list) => {
      const now = Date.now();

      for (const entry of list.getEntries()) {
        if (!(entry as LayoutShift).hadRecentInput) {
          const value = (entry as LayoutShift).value;
          sessionValue += value;
          shiftCount++;

          if (sessionValue > clsValue) {
            clsValue = sessionValue;
          }
        }
      }

      // Batch log layout shifts instead of individual warnings
      if (now - lastLogTime > LOG_THROTTLE_MS && shiftCount > 0) {
        console.warn(
          `⚠️ ${shiftCount} Layout Shifts detected (Total CLS: ${clsValue.toFixed(3)})`,
        );
        shiftCount = 0;
        lastLogTime = now;
      }
    });

    observer.observe({ type: "layout-shift", buffered: true });
  } catch (error) {
    console.error("Failed to observe layout shifts:", error);
  }
}

/**
 * Monitor memory usage
 */
export function getMemoryUsage() {
  if (
    typeof window === "undefined" ||
    !(performance as PerformanceWithMemory).memory
  ) {
    return null;
  }

  const memory = (performance as PerformanceWithMemory).memory;
  return {
    usedJSHeapSize: (memory.usedJSHeapSize / 1048576).toFixed(2) + " MB",
    totalJSHeapSize: (memory.totalJSHeapSize / 1048576).toFixed(2) + " MB",
    jsHeapSizeLimit: (memory.jsHeapSizeLimit / 1048576).toFixed(2) + " MB",
    percentage:
      ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2) + "%",
  };
}

/**
 * Get connection information
 */
export function getConnectionInfo() {
  if (typeof window === "undefined") return null;

  const connection = (navigator as NavigatorWithConnection).connection;
  if (!connection) return null;

  return {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
    saveData: connection.saveData,
  };
}

/**
 * Export performance report
 */
export function exportPerformanceReport() {
  const report = {
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : "N/A",
    metrics: getMetrics(),
    memory: getMemoryUsage(),
    connection: getConnectionInfo(),
    resources: trackResourceTiming(),
  };

  console.log("📊 Performance Report:", report);
  return report;
}

/**
 * Start performance monitoring session (highly optimized)
 */
export function startPerformanceSession() {
  if (typeof window === "undefined") return;

  mark("session-start");

  // Only enable tracking in development with minimal overhead
  if (process.env.NODE_ENV === "development") {
    // Track performance issues but with heavy throttling
    trackLongTasks();
    trackLayoutShifts();

    // Log performance report only every 2 minutes to minimize overhead
    const interval = setInterval(() => {
      const report = exportPerformanceReport();
      // Only log if there are significant metrics and issues
      if (report.metrics.LCP || report.metrics.CLS) {
        const hasIssues =
          (report.metrics.LCP && report.metrics.LCP > 2500) ||
          (report.metrics.CLS && report.metrics.CLS > 0.1);

        // Only log when there are actual performance issues
        if (hasIssues) {
          console.table({
            FCP: report.metrics.FCP
              ? `${Math.round(report.metrics.FCP)}ms`
              : "N/A",
            LCP: report.metrics.LCP
              ? `${Math.round(report.metrics.LCP)}ms`
              : "N/A",
            CLS: report.metrics.CLS ? report.metrics.CLS.toFixed(3) : "N/A",
            TTFB: report.metrics.TTFB
              ? `${Math.round(report.metrics.TTFB)}ms`
              : "N/A",
          });
        }
      }
    }, 120000); // Increased to 120s (2 minutes) to reduce monitoring overhead

    // Clean up on page unload
    const cleanup = () => {
      clearInterval(interval);
    };

    window.addEventListener("beforeunload", cleanup);
    window.addEventListener("pagehide", cleanup);
  }
}
