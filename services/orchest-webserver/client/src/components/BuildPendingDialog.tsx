import React from "react";
import {
  MDCButtonReact,
  MDCDialogReact,
  MDCLinearProgressReact,
} from "@orchest/lib-mdc";
import { Box } from "@orchest/design-system";
import { RefManager, makeRequest } from "@orchest/lib-utils";
import { useOrchest } from "@/hooks/orchest";
import { checkGate } from "../utils/webserver-utils";
import { siteMap } from "@/Routes";
import { useInterval } from "@/hooks/use-interval";
import { useCustomRoute } from "@/hooks/useCustomRoute";

const buildFailMessage = `Some environment builds of this project have failed. 
  You can try building them again, 
  but you might need to change the environment setup script in 
  order for the build to succeed.`;

export interface IBuildPendingDialogProps {
  environmentValidationData: any;
  projectUuid: string;
  requestedFromView: string;
  onBuildComplete: any;
  onCancel: any;
  onClose: any;
}

const BuildPendingDialog: React.FC<IBuildPendingDialogProps> = (props) => {
  const { navigateTo } = useCustomRoute();

  const [gateInterval, setGateInterval] = React.useState(null);
  const [state, setState] = React.useState(null);
  const [environmentsToBeBuilt, setEnvironmentsToBeBuilt] = React.useState<
    string[]
  >([]);

  const { dispatch } = useOrchest();
  const [refManager] = React.useState(new RefManager());

  const processValidationData = (data) => {
    let messageSuffix = "";
    switch (props?.requestedFromView) {
      case "Pipeline":
        messageSuffix =
          " You can cancel to open the pipeline in read-only mode.";
        break;
      case "JupyterLab":
        messageSuffix =
          " To start JupyterLab all environments in the project need to be built.";
        break;
    }

    let inactiveEnvironments: string[] = [];
    let buildHasFailed = false;
    let environmentsBuilding = 0;
    let building = false;

    for (let x = 0; x < data.actions.length; x++) {
      if (data.actions[x] == "BUILD" || data.actions[x] == "RETRY") {
        inactiveEnvironments.push(data.fail[x]);

        if (data.actions[x] == "RETRY") {
          buildHasFailed = true;
        }
      } else if (data.actions[x] == "WAIT") {
        building = true;
        environmentsBuilding++;
      }
    }

    let message = "";
    if (buildHasFailed) {
      message = buildFailMessage;
    } else if (inactiveEnvironments.length > 0) {
      message =
        `Not all environments of this project have been built. Would you like to build them?` +
        messageSuffix;
    } else {
      message =
        `Some environments of this project are still building. Please wait until the build is complete.` +
        messageSuffix;
    }
    setEnvironmentsToBeBuilt(inactiveEnvironments);
    setState((prevState) => ({
      ...prevState,
      building,
      buildHasFailed,
      message,
      environmentsBuilding,
      showBuildStatus: inactiveEnvironments.length == 0,
      allowBuild: inactiveEnvironments.length > 0,
    }));

    if (environmentsBuilding > 0) {
      startPollingGate();
    } else {
      setGateInterval(null);
    }
  };

  const close = () => {
    refManager.refs.dialogRef.close();
  };

  const startPollingGate = () => {
    setGateInterval(1000);
  };

  const gateCheckWrapper = () => {
    checkGate(props.projectUuid)
      .then(() => {
        setState((prevState) => ({
          ...prevState,
          building: false,
        }));

        if (props.onBuildComplete) {
          close();
          props.onBuildComplete();
        }
      })
      .catch((error) => {
        // Gate check failed, check why it failed and act
        // accordingly
        processValidationData(error.data);
      });
  };

  const onBuild = () => {
    setState((prevState) => ({
      ...prevState,
      allowBuild: false,
      showBuildStatus: true,
      building: true,
    }));

    let environment_build_requests = environmentsToBeBuilt.map(
      (environmentUuid) => ({
        environment_uuid: environmentUuid,
        project_uuid: props.projectUuid,
      })
    );

    makeRequest("POST", "/catch/api-proxy/api/environment-builds", {
      type: "json",
      content: {
        environment_build_requests,
      },
    })
      .then(() => {
        startPollingGate();
      })
      .catch((error) => {
        console.error("Failed to start environment builds:", error);
      });
  };

  const onViewBuildStatus = () => {
    navigateTo(siteMap.environments.path, {
      query: { projectUuid: props.projectUuid },
    });

    close();
  };

  const onCancel = () => {
    if (props.onCancel) {
      props.onCancel();
    }
    close();
  };

  useInterval(() => {
    gateCheckWrapper();
  }, gateInterval);

  React.useEffect(() => {
    processValidationData(props.environmentValidationData);

    return () => setGateInterval(null);
  }, []);

  return (
    <MDCDialogReact
      ref={refManager.nrefs.dialogRef}
      title={"Build"}
      onClose={props.onClose}
      content={
        <div>
          <p>{state?.message}</p>
          {state?.building && (
            <Box css={{ marginTop: "$4" }}>
              <MDCLinearProgressReact />
            </Box>
          )}
        </div>
      }
      actions={
        <>
          <MDCButtonReact label="Cancel" onClick={onCancel} />
          {state?.showBuildStatus && (
            <MDCButtonReact
              submitButton
              label="View build status"
              classNames={
                !state.allowBuild
                  ? ["push-left", "mdc-button--raised", "themed-secondary"]
                  : ["push-left"]
              }
              onClick={onViewBuildStatus}
            />
          )}
          {state?.allowBuild && (
            <MDCButtonReact
              submitButton
              classNames={[
                "mdc-button--raised",
                "themed-secondary",
                "push-left",
              ]}
              label="Build"
              onClick={onBuild}
            />
          )}
        </>
      }
    />
  );
};

export default BuildPendingDialog;
