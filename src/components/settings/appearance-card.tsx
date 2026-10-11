import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Theme selector. The preference lives in localStorage on this device only
 * (see theme-script), so there is nothing to save server-side.
 */
export function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how PRX looks on this device. &ldquo;System&rdquo; follows your operating system setting.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ThemeToggle />
      </CardContent>
    </Card>
  );
}
