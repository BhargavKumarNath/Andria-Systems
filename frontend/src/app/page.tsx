import OverviewPage from "./overview/page";

export default function RootPage() {
  // For static export, we render the Overview page directly at the root
  // while also maintaining the isolated /overview route.
  return <OverviewPage />;
}
