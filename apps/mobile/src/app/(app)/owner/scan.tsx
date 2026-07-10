import { router, useLocalSearchParams } from "expo-router";

import { Button } from "@/components/button";
import { OwnerBadge } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { ScanWorkstation } from "@/features/scan/scan-workstation";

/**
 * The CafeOwner's scan screen (#20): the counter workstation framed with the
 * owner's badge. The workstation itself (camera, member-code fallback, held
 * outcome, Redemption confirm) is shared with the shift's scanner mode (#80).
 */
export default function ScanPurchase() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";

  return (
    <ScanWorkstation
      cafeId={cafeId}
      header={<OwnerBadge>{cafeName}</OwnerBadge>}
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
