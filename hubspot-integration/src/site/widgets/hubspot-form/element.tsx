import React from "react";
import ReactDOM from "react-dom";
import reactToWebComponent from "react-to-webcomponent";
import { HubSpotFormWidget } from "./Widget";

const customElement = reactToWebComponent(
  HubSpotFormWidget,
  React,
  ReactDOM as any,
  {
    props: {
      portalId: "string",
      formId: "string",
      region: "string",
    },
  },
);

export default customElement;
