//
// ff4script.js
// created 4/8/2018
//

var FF4Script = {};
FF4Script.name = "FF4Script";

FF4Script.initScript = function(script) {
    var offset, label, e;
    if (script.key === "npcScript") {
        
        // return if there is no npc dialog
        var end = script.data.length - 2;
        if (script.data[end] === 0xFF) return;
        
        // find the beginning of the npc dialog indexes
        while (end > 0 && script.data[end - 1] !== 0xFF) {
            end--;
        }
        if (end < 1) return;
        
        script.addPlaceholder(null, end + 1, "npcDialog");
    } else if (script.key === "_npcScript") {
        // add references for npcs
        for (e = 0; e < script.rom.npcPointers.array.length; e++) {
            offset = script.rom.npcPointers.item(e).scriptPointer.value;
            label = script.rom.stringTable.npcSwitch.formattedString(e);
            script.addPlaceholder(null, offset, "npc", label);
        }
    } else if (script.key === "eventScript") {
        // add references for events
        for (e = 1; e < script.rom.eventPointers.array.length; e++) {
            offset = script.rom.eventPointers.item(e).scriptPointer.value;
            label = script.rom.stringTable.eventPointers.formattedString(e);
            script.addPlaceholder(null, offset, "event", label);
        }
    }
}

FF4Script.didDisassemble = function(command, data) {
    switch (command.key) {
        case "repeat":
            break;
            
        default:
            break;
    }
}

FF4Script.description = function(command) {
    var desc = "Invalid Command"
    
    if (command.encoding === "npcDialog") {
        
        var script = command.parent;
        var i = script.command.length - 1;
        while (script.command[i].encoding === "npcDialog") i--;
        i = script.command.indexOf(command) - i;
        desc = "NPC Dialog " + i + ":<br/>"
        
        var dialog = command.rom.mapDialog.item(map.m).item(command.dialog.value);
        if (dialog) {
            return desc + dialog.htmlText;
        } else {
            return desc + "Invalid Dialog Message";
        }
    }
    
    switch (command.key) {

        case "action":
            return "Action for " + this.string(command, "object") + ": " + this.string(command, "action");

        case "end":
            return "End of Script";
            
        case "eventDialog":
            var b = command.bank.value;
            var dialog;
            if (b === 0xF0) {
                dialog = command.rom.eventDialog1.item(command.dialog1.value);
            } else if (b === 0xF1) {
                dialog = command.rom.eventDialog1.item(command.dialog2.value);
            } else if (b === 0xF6) {
                dialog = command.rom.eventDialog2.item(command.dialog3.value);
            }
            if (dialog) {
                return "Display Event Dialog:<br/>" + dialog.htmlText;
            } else {
                return "Display Event Dialog:<br/>Invalid Dialog Message";
            }

        case "mapDialog":
            var m = map.m;
            
//            var script = command.parent;
//            var i = script.command.indexOf(command) - 1;
//            while (i > 0) {
//                if (script.command[i].key === "map") {
//                    if (script.command[i].mapMSB.value) {
//                        m = script.command[i].map2.value;
//                    } else {
//                        m = script.command[i].map1.value;
//                    }
//                    break;
//                }
//                i--;
//            }
            
            var dialog = command.rom.mapDialog.item(m).item(command.dialog.value);
            if (dialog) {
                return "Display Map Dialog:<br/>" + dialog.htmlText;
            } else {
                return "Display Map Dialog:<br/>Invalid Dialog Message";
            }

        case "dialogYesNo":
            var dialog = command.rom.eventDialog1.item(command.dialog.value);
            if (dialog) {
                return "Display Dialog (Yes/No):<br/>" + dialog.htmlText;
            } else {
                return "Display Dialog (Yes/No):<br/>Invalid Dialog Message";
            }

        case "map":
            if (command.mapMSB.value) {
                return "Load Map: " + this.string(command, "map2", "mapProperties");
            } else {
                return "Load Map: " + this.string(command, "map1", "mapProperties");
            }

        case "inn":
            return "Inn: " + this.string(command, "price");
            
        case "shop":
            return "Shop: " + this.string(command, "shop");

        case "repeat":
            return "Repeat " + command.count.value + " Times";

        case "switch":
            this.fixSwitch(command.eventSwitch);
            this.fixSwitch(command.npcSwitch);
            var onOff = (command.onOff.value === 1) ? "Off" : "On";
            if (command.type.value === 1) {
                return "Turn Event Switch " + onOff + ": " + this.string(command, "eventSwitch", "eventSwitch");
            } else {
                return "Turn NPC Switch " + onOff + ": " + this.string(command, "npcSwitch", "npcSwitch");
            }

        case "event":
            if (command.event.value >= 39 && command.event.value <= 46) {
                // map dialog event
                var d = command.event.value - 39;
                desc = "Display Map Dialog " + d + ": <br/>";
                var dialog = command.rom.mapDialog.item(map.m).item(d);
                if (dialog) {
                    return desc + dialog.htmlText;
                } else {
                    return desc + "Invalid Dialog Message";
                }
            }
            return "Execute Event: " + this.string(command, "event", "eventPointers");
        
        case "off":
            this.fixSwitch(command.switch);
            return "If Switch is Off: " + this.string(command, "switch", "eventSwitch");

        case "on":
            this.fixSwitch(command.switch);
            return "If Switch is On: " + this.string(command, "switch", "eventSwitch");

        default:
            return command.name;
    }
    return desc;
}

FF4Script.string = function(command, key, stringKey) {
    var stringTable;
    if (stringKey) {
        stringTable = command.rom.stringTable[stringKey];
    } else {
        stringTable = command.rom.stringTable[command[key].stringTable];
    }
    return stringTable.formattedString(command[key].value);
}

FF4Script.fixSwitch = function(switchProperty) {
    if (map.m > 256 && switchProperty.offset !== 256) {
        switchProperty.offset = 256;
        switchProperty.value += 256;
    } else if (map.m <= 256 && switchProperty.offset !== 0) {
        switchProperty.offset = 0;
        switchProperty.value -= 256;
    }
}