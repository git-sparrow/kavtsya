import { router, useLocalSearchParams } from "expo-router";

import { Button } from "@/components/button";
import { useMe } from "@/features/account/me-context";
import {
  ScanRoleHeader,
  ScanWorkstation,
} from "@/features/scan/scan-workstation";

/**
 * The CafeOwner's scan screen (#20): the counter workstation framed with the
 * permanent role header (2a). The workstation itself (camera, member-code
 * fallback, held outcome, Redemption confirm) is shared with the shift's
 * Scanner Mode (#80).
 */
export default function ScanPurchase() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";

  return (
    <ScanWorkstation
      cafeId={cafeId}
      header={<ScanRoleHeader cafeName={cafeName} />}
      exit={
        <Button
          title="Назад"
          variant="secondary"
          onPress={() => router.back()}
        />
      }
    />
  );
}
