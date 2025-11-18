"use client";

import dynamic from "next/dynamic";
import { ComponentType, Suspense } from "react";
import {
  LoadingSpinner,
  EditorLoadingSkeleton,
  PageLoadingState,
} from "./ui/LoadingStates";

/**
 * Lazy-loaded components with optimized loading states
 * This reduces initial bundle size and improves performance
 */

// Lazy load the TiptapEditor component
export const LazyTiptapEditor = dynamic(
  () => import("./TiptapEditor").then((mod) => mod.default),
  {
    loading: () => <EditorLoadingSkeleton />,
    ssr: false, // Editor should only render on client
  },
);

// Lazy load the CollaborativeEditor component (optional - comment out if not exported)
// export const LazyCollaborativeEditor = dynamic(
//   () => import("./CollaborativeEditor").then((mod) => mod.default),
//   {
//     loading: () => <EditorLoadingSkeleton />,
//     ssr: false,
//   }
// );

// Lazy load the PresenceBar component
export const LazyPresenceBar = dynamic(
  () => import("./PresenceBar").then((mod) => mod.default),
  {
    loading: () => (
      <div style={{ height: "40px", padding: "8px" }}>
        <LoadingSpinner size="sm" />
      </div>
    ),
    ssr: false,
  },
);

// Lazy load the InviteForm component
export const LazyInviteForm = dynamic(
  () => import("./InviteForm").then((mod) => mod.default),
  {
    loading: () => <PageLoadingState message="Loading form..." />,
    ssr: true, // Can be server-rendered
  },
);

// Lazy load the DocList component (optional - comment out if not exported)
// export const LazyDocList = dynamic(
//   () => import("./DocList").then((mod) => mod.default),
//   {
//     loading: () => <PageLoadingState message="Loading documents..." />,
//     ssr: true,
//   }
// );

// Lazy load the DashboardClient component
export const LazyDashboardClient = dynamic(
  () => import("./DashboardClient").then((mod) => mod.default),
  {
    loading: () => <PageLoadingState message="Loading dashboard..." />,
    ssr: false,
  },
);

/**
 * Generic lazy loading wrapper with custom loading component
 */
interface LazyWrapperProps<T extends Record<string, unknown>> {
  component: Promise<{ default: ComponentType<T> }>;
  loadingComponent?: React.ReactNode;
  props: T;
}

export function LazyWrapper<T extends Record<string, unknown>>({
  component,
  loadingComponent = <LoadingSpinner />,
  props,
}: LazyWrapperProps<T>) {
  const LazyComponent = dynamic(() => component, {
    loading: () => <>{loadingComponent}</>,
  });

  return (
    <Suspense fallback={loadingComponent}>
      <LazyComponent {...props} />
    </Suspense>
  );
}

/**
 * Preload function for critical components
 * Call this on user interaction (hover, focus) to prefetch components
 */
export const preloadComponents = {
  editor: () => {
    const preload = dynamic(() => import("./TiptapEditor"));
    return preload;
  },
  // collaborativeEditor: () => {
  //   const preload = dynamic(() => import("./CollaborativeEditor"));
  //   return preload;
  // },
  presenceBar: () => {
    const preload = dynamic(() => import("./PresenceBar"));
    return preload;
  },
  inviteForm: () => {
    const preload = dynamic(() => import("./InviteForm"));
    return preload;
  },
};

/**
 * Lazy load heavy third-party libraries
 */

// Lazy load Y.js and related libraries
export const lazyLoadYjs = () => import("yjs");

export const lazyLoadYWebsocket = () =>
  import("y-websocket").then((mod) => ({
    WebsocketProvider: mod.WebsocketProvider,
  }));

export const lazyLoadYProsemirror = () => import("y-prosemirror");

/**
 * Code splitting helper for route-based lazy loading
 */
export function createLazyRoute<T>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  loadingMessage = "Loading...",
) {
  return dynamic(importFn, {
    loading: () => <PageLoadingState message={loadingMessage} />,
    ssr: true,
  });
}

/**
 * Utility to check if component should be lazy loaded
 * based on connection speed and device capabilities
 */
interface NavigatorConnection {
  effectiveType?: string;
  saveData?: boolean;
}

interface ExtendedNavigator extends Navigator {
  connection?: NavigatorConnection;
  deviceMemory?: number;
}

export function shouldLazyLoad(): boolean {
  if (typeof window === "undefined") return true;

  // Check for slow connection
  const connection = (navigator as ExtendedNavigator).connection;
  if (connection) {
    const slowConnection =
      connection.effectiveType === "slow-2g" ||
      connection.effectiveType === "2g" ||
      connection.saveData === true;

    if (slowConnection) return true;
  }

  // Check for low-end device
  const deviceMemory = (navigator as ExtendedNavigator).deviceMemory;
  if (deviceMemory && deviceMemory < 4) {
    return true;
  }

  return false;
}

/**
 * Intersection Observer-based lazy loading
 * Only loads component when it's about to enter viewport
 */
export function LazyLoadOnView({
  children,
  fallback = <LoadingSpinner />,
  rootMargin = "100px",
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
}) {
  const [isVisible, setIsVisible] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} style={{ minHeight: "100px" }}>
      {isVisible ? children : fallback}
    </div>
  );
}

// Fix missing React import
import React from "react";
