import { router } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { Screen } from "@/components/screen";
import { useMe } from "@/features/account/me-context";
import { RegisterCafeForm } from "@/features/cafe/register-cafe-form";
import { useMode } from "@/features/mode/mode-context";

/**
 * «Стати Кавоваром» / «Зареєструвати ще одну» — the register-café subscreen the
 * Settings РОЛІ / МОЇ КАВ'ЯРНІ rows open (redesign turn 4: progressive
 * disclosure, never an inline form). A thin, working home for the existing
 * `RegisterCafeForm`; turn 5d restyles this screen (labelled name field, unlock
 * card, price footer). On success it re-derives from server truth — a fresh
 * owner lands in CafeOwner Mode — by refetching /api/me, dropping any excursion,
 * and popping back to the Mode dispatcher.
 */
export default function RegisterCafeScreen() {
  const { reload } = useMe();
  const { clearExcursion } = useMode();

  return (
    <Screen
      header={
        <BackHeader title="Стати Кавоваром" testID="register-cafe.back" />
      }
    >
      <RegisterCafeForm
        onRegistered={async () => {
          await reload();
          clearExcursion();
          router.dismissAll();
        }}
      />
    </Screen>
  );
}
