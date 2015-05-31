import BehaviorPropertiesResource, { BehaviorProperty } from "../data/BehaviorPropertiesResource";

let behaviorEditorDataListIndex = 0;

interface Config {
  behaviorName: string;
  propertyValues: { [name: string]: { value: any, type: string }; }
}

export default class BehaviorEditor {
  tbody: HTMLTableSectionElement;
  config: Config;
  projectClient: SupClient.ProjectClient;
  editConfig: any;

  behaviorPropertiesResource: BehaviorPropertiesResource;

  behaviorNamesDataListElt: HTMLDataListElement;
  behaviorNameField: HTMLInputElement;
  behaviorPropertiesHeaderRow: HTMLTableRowElement;

  propertySettingsByName: { [name: string]: SupClient.table.RowParts };

  constructor(tbody: HTMLTableSectionElement, config: Config, projectClient: SupClient.ProjectClient, editConfig: any) {
    this.tbody = tbody;
    this.config = config;
    this.projectClient = projectClient;
    this.editConfig = editConfig;

    this.behaviorNamesDataListElt = document.createElement("datalist");
    this.behaviorNamesDataListElt.id = `behavior-editor-datalist-${behaviorEditorDataListIndex++}`;
    this.tbody.appendChild(this.behaviorNamesDataListElt);

    let behaviorNameRow = SupClient.table.appendRow(this.tbody, "Class");
    this.behaviorNameField = SupClient.table.appendTextField(behaviorNameRow.valueCell, this.config.behaviorName);
    this.behaviorNameField.setAttribute("list", this.behaviorNamesDataListElt.id);
    this.behaviorNameField.addEventListener("change", this._onChangeBehaviorName);

    this.behaviorPropertiesHeaderRow = document.createElement("tr");
    let headerTh = document.createElement("th");
    headerTh.textContent = "Customizable properties";
    headerTh.colSpan = 2;
    this.behaviorPropertiesHeaderRow.appendChild(headerTh);
    this.tbody.appendChild(this.behaviorPropertiesHeaderRow);

    this.propertySettingsByName = {};

    this.projectClient.subResource("behaviorProperties", this);
  }

  destroy() { this.projectClient.unsubResource("behaviorProperties", this); }

  onResourceReceived = (resourceId: string, resource: BehaviorPropertiesResource) => {
    this.behaviorPropertiesResource = resource;
    this._buildBehaviorPropertiesUI();
  }

  onResourceEdited = (resourceId: string, command: string, ...args: any[]) => {
    if (command === "setScriptBehaviors" || command === "clearScriptBehaviors") this._buildBehaviorPropertiesUI();
  }

  _buildBehaviorPropertiesUI() {
    // Setup behavior list
    this.behaviorNamesDataListElt.innerHTML = "";
    for (let behaviorName in this.behaviorPropertiesResource.pub.behaviors) {
      let option = document.createElement("option");
      option.value = behaviorName;
      option.textContent = behaviorName;
      this.behaviorNamesDataListElt.appendChild(option);
    }

    // Clear old property settings
    for (let name in this.propertySettingsByName) {
      let propertySetting = this.propertySettingsByName[name];
      propertySetting.row.parentElement.removeChild(propertySetting.row);
    }

    this.propertySettingsByName = {};

    // Setup new property settings
    let behaviorName = this.config.behaviorName;

    let listedProperties: string[] = [];

    while (behaviorName != null) {
      let behavior = this.behaviorPropertiesResource.pub.behaviors[behaviorName];
      if(behavior == null) break;

      for (let property of behavior.properties) {
        if(listedProperties.indexOf(property.name) !== -1) continue;

        listedProperties.push(property.name);
        this._createPropertySetting(property);
      }
      behaviorName = behavior.parentBehavior;
    }

    // TODO: Display and allow cleaning up left-over property values
  }

  _createPropertySetting(property: {name: string; type: string}) {
    let propertySetting = SupClient.table.appendRow(this.tbody, property.name, { checkbox: true, title: `${property.name} (${property.type})` });
    this.propertySettingsByName[property.name] = propertySetting;
    this._createPropertyField(property.name);

    propertySetting.checkbox.checked = this.config.propertyValues[property.name] != null;
    propertySetting.checkbox.addEventListener("change", (event: any) => {
      if (! event.target.checked) {
        this.editConfig("clearBehaviorPropertyValue", property.name);
        return;
      }

      // defaultValue = property.value someday
      let defaultValue: any;
      switch (property.type) {
        case "boolean": { defaultValue = false; break; }
        case "number": { defaultValue = 0; break; }
        case "string": { defaultValue = ""; break; }
        // TODO: Support more types
        default: { defaultValue = null; break; }
      }

      this.editConfig("setBehaviorPropertyValue", property.name, property.type, defaultValue);
    });
  }

  _createPropertyField(propertyName: string) {
    let behaviorName = this.config.behaviorName;
    let property: BehaviorProperty;
    while (behaviorName != null) {
      let behavior = this.behaviorPropertiesResource.pub.behaviors[behaviorName];

      property = this.behaviorPropertiesResource.propertiesByNameByBehavior[behaviorName][propertyName];
      if (property != null) break;

      behaviorName = behavior.parentBehavior;
    }

    let propertySetting = this.propertySettingsByName[propertyName];

    // TODO: We probably want to collect and display default values?
    // defaultPropertyValue = behaviorProperty?.value

    let propertyValue: any = null;
    let uiType = property.type;

    let propertyValueInfo = this.config.propertyValues[property.name];
    if (propertyValueInfo != null) {
      propertyValue = propertyValueInfo.value;
      if (propertyValueInfo.type !== property.type) uiType = "incompatibleType";
    }

    let propertyField: HTMLInputElement;
    switch (uiType) {
      case "incompatibleType": {
        propertyField = <HTMLInputElement>propertySetting.valueCell.querySelector("input[type=text]");
        if (propertyField == null) {
          propertySetting.valueCell.innerHTML = "";
          propertyField = SupClient.table.appendTextField(propertySetting.valueCell, "");
          propertyField.addEventListener("change", this._onChangePropertyValue);
        }

        propertyField.value = `(Incompatible type: ${propertyValueInfo.type})`;
        propertyField.disabled = true;
        break;
      }

      case "boolean": {
        propertyField = <HTMLInputElement>propertySetting.valueCell.querySelector("input[type=checkbox]");
        if (propertyField == null) {
          propertySetting.valueCell.innerHTML = "";
          propertyField = SupClient.table.appendBooleanField(propertySetting.valueCell, false);
          propertyField.addEventListener("change", this._onChangePropertyValue);
        }

        propertyField.checked = propertyValue;
        propertyField.disabled = propertyValueInfo == null;
        break;
      }

      case "number": {
        propertyField = <HTMLInputElement>propertySetting.valueCell.querySelector("input[type=number]");
        if (propertyField == null) {
          propertySetting.valueCell.innerHTML = "";
          propertyField = SupClient.table.appendNumberField(propertySetting.valueCell, 0);
          propertyField.addEventListener("change", this._onChangePropertyValue);
        }

        propertyField.value = propertyValue;
        propertyField.disabled = propertyValueInfo == null;
        break;
      }

      case "string": {
        propertyField = <HTMLInputElement>propertySetting.valueCell.querySelector("input[type=text]");
        if (propertyField == null) {
          propertySetting.valueCell.innerHTML = "";
          propertyField = SupClient.table.appendTextField(propertySetting.valueCell, "");
          propertyField.addEventListener("change", this._onChangePropertyValue);
        }

        propertyField.value = propertyValue;
        propertyField.disabled = propertyValueInfo == null;
        break;
      }

      // TODO: Support more types
      default: {
        propertySetting.valueCell.innerHTML = "";
        console.error(`Unsupported property type: ${property.type}`);
        return;
      }
    }
    (<any>propertyField.dataset).behaviorPropertyName = property.name;
    (<any>propertyField.dataset).behaviorPropertyType = property.type;
  }

  config_setProperty(path: string, value: any) {
    switch (path) {
      case "behaviorName": {
        this.behaviorNameField.value = value;
        this._buildBehaviorPropertiesUI();
        break;
      }
    }
  }

  config_setBehaviorPropertyValue(name: string, type: string, value: any) {
    this.propertySettingsByName[name].checkbox.checked = true;

    this._createPropertyField(name);
  }

  config_clearBehaviorPropertyValue(name: string) {
    this.propertySettingsByName[name].checkbox.checked = false;
    this._createPropertyField(name);
  }

  _onChangeBehaviorName = (event: any) => { this.editConfig("setProperty", "behaviorName", event.target.value); }

  // _onChangePropertySet = (event: any) => {}

  _onChangePropertyValue = (event: any) => {
    let propertyName = event.target.dataset.behaviorPropertyName;
    let propertyType = event.target.dataset.behaviorPropertyType;
    let propertyValue: any;

    switch (propertyType) {
      case "boolean": { propertyValue = event.target.checked; break; }
      case "number": { propertyValue = parseFloat(event.target.value); break }
      case "string": { propertyValue = event.target.value; break }
      default: { console.error(`Unsupported property type: ${propertyType}`); break }
    }

    this.editConfig("setBehaviorPropertyValue", propertyName, propertyType, propertyValue, (err: string) => {
      if (err != null) alert(err);
    });
  }
}
