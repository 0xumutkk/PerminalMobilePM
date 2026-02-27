import React from "react";
import { PrivyProvider, SecureStorageAdapter } from "@privy-io/expo";
import { PrivyElements } from "@privy-io/expo/ui";

export const PrivyAuthProvider = ({ children }: { children: React.ReactNode }) => {
    const appId = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
    const rawClientId = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;
    const clientId = (rawClientId && rawClientId !== "YOUR_PRIVY_CLIENT_ID") ? rawClientId : undefined;

    return (
        <PrivyProvider
            appId={appId || ""}
            clientId={clientId}
            storage={SecureStorageAdapter}
            config={{
                embedded: {
                    solana: {
                        createOnLogin: "users-without-wallets",
                    },
                },
            }}
        >
            <PrivyElements />
            {children}
        </PrivyProvider>
    );
};
