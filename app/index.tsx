import { Redirect } from "expo-router";
import { usePrivy } from "@privy-io/expo";

/**
 * Root index: redirect to app when logged in, otherwise to login screen.
 * This avoids "/" resolving to (app)/index (Home) when using router.replace("/") after logout.
 */
export default function RootIndex() {
    const { isReady, user } = usePrivy();

    if (!isReady) {
        return <Redirect href="/login" />;
    }
    if (user) {
        return <Redirect href="/(app)" />;
    }
    return <Redirect href="/login" />;
}
