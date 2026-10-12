import { Stagger, StaggerItem } from "@/components/motion";
import { cn } from "@/lib/utils";
import type { ProjectTabProps } from "../tabs/types";
import { OVERVIEW_GRID, OVERVIEW_MAIN, OVERVIEW_MAIN_FULL, OVERVIEW_SIDE } from "./grid";
import { visibleOverviewCards } from "./registry";

/**
 * The Overview tab: the registered overview cards in a main and a side column
 * (layout in ./grid.ts). Cards rise in one after another on first mount.
 */
export function OverviewTab(props: ProjectTabProps) {
  const main = visibleOverviewCards(props, "main");
  const side = visibleOverviewCards(props, "side");

  return (
    <div className={OVERVIEW_GRID}>
      <Stagger className={cn(OVERVIEW_MAIN, side.length === 0 && OVERVIEW_MAIN_FULL)}>
        {main.map(({ id, component: CardComponent }) => (
          <StaggerItem key={id} className="min-w-0">
            <CardComponent {...props} />
          </StaggerItem>
        ))}
      </Stagger>
      {side.length > 0 ? (
        <Stagger className={OVERVIEW_SIDE}>
          {side.map(({ id, component: CardComponent }) => (
            <StaggerItem key={id} className="min-w-0">
              <CardComponent {...props} />
            </StaggerItem>
          ))}
        </Stagger>
      ) : null}
    </div>
  );
}
