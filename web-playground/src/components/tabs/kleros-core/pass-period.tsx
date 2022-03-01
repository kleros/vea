import React from "react";
import { Button } from "@kleros/ui-components-library";
import { ArbitrumRinkeby } from "@usedapp/core";
import {
  IKlerosCoreDisputeInfo,
  useKlerosCoreTimesPerPeriodQuery,
} from "queries/useKlerosCoreDisputesQuery";
import { useContractFunction } from "hooks/useContractFunction";
import { PERIODS } from "./disputes-table";
import ArbitrumLogo from "svgs/arbitrum_opacity.svg";

const PassPeriodButton: React.FC<{ dispute?: IKlerosCoreDisputeInfo }> = ({
  dispute,
}) => {
  const { data: timesPerPeriod } = useKlerosCoreTimesPerPeriodQuery(
    dispute?.subcourtID
  );
  let disabled = true;
  if (dispute && timesPerPeriod && dispute.period !== PERIODS.execution) {
    const timeSinceLastPeriodChange =
      Math.floor(Date.now() / 1000) - dispute.lastPeriodChange.toNumber();
    const currentPeriodDuration = timesPerPeriod[dispute.period];
    if (timeSinceLastPeriodChange >= currentPeriodDuration)
      if (dispute.period !== PERIODS.evidence) disabled = false;
      else {
        const allJurorsDrawn =
          dispute.drawnJurors.length >= dispute.nbVotes.toNumber();
        disabled = !allJurorsDrawn;
      }
  }

  const { sendWithSwitch, state } = useContractFunction(
    "KlerosCore",
    "passPeriod",
    {
      chainId: ArbitrumRinkeby.chainId,
    }
  );
  return (
    <Button
      text="Pass period"
      icon={(className: string) => <ArbitrumLogo {...{ className }} />}
      disabled={
        !["None", "Exception", "Fail"].includes(state.status) || disabled
      }
      onClick={() => dispute && sendWithSwitch(dispute.disputeID)}
    />
  );
};

export default PassPeriodButton;
