import { Redirect } from "expo-router";

import { useApp } from "../src/state/app";

export default function Index() {
  const { user } = useApp();
  return <Redirect href={user ? "/(tabs)" : "/welcome"} />;
}
