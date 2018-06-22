//
// ff5map.js
// created 3/13/2018
//

function FF5Map(rom) {
    
    this.rom = rom;
    this.tileset = new FF5MapTileset(rom, this);
    this.scrollDiv = document.getElementById("map-scroll");
    this.canvas = document.getElementById("map");
    this.cursorCanvas = document.getElementById("map-cursor");
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 256;
    this.mapCanvas.height = 256;
    this.mapSectors = [false];
    this.npcCanvas = document.createElement('canvas');

    this.mapProperties = null;
    this.m = null; // map index
    this.l = 0; // selected layer
    this.zoom = 1.0; // zoom multiplier
    this.selection = new Uint8Array([0x73, 0, 0, 1, 1, 0]);
    this.clickedCol = null;
    this.clickedRow = null;
    this.clickButton = null;
    this.layer = [new FF5MapLayer(rom, FF5MapLayer.Type.layer1),
                  new FF5MapLayer(rom, FF5MapLayer.Type.layer2),
                  new FF5MapLayer(rom, FF5MapLayer.Type.layer3)];
    this.selectedLayer = this.layer[0];
    this.worldLayer = new FF5MapLayer(rom, FF5MapLayer.Type.world);
    this.triggers = [];
    this.selectedTrigger = null;
    this.dirtyRect = null;
    this.mapRect = new Rect(0, 0, 256, 256);
    
    this.ppu = new GFX.PPU();

    var map = this;
    this.scrollDiv.parentElement.onscroll = function() { map.scroll() };
//    window.addEventListener("resize", map.scroll, false);
    this.scrollDiv.onmousedown = function(e) { map.mouseDown(e) };
    this.scrollDiv.onmouseup = function(e) { map.mouseUp(e) };
    this.scrollDiv.onmousemove = function(e) { map.mouseMove(e) };
    this.scrollDiv.onmouseenter = function(e) { map.mouseEnter(e) };
    this.scrollDiv.onmouseleave = function(e) { map.mouseLeave(e) };
    this.scrollDiv.oncontextmenu = function() { return false; };

    document.getElementById("showLayer1").onchange = function() { map.changeLayer("showLayer1"); twoState(this); };
    document.getElementById("showLayer2").onchange = function() { map.changeLayer("showLayer2"); twoState(this); };
    document.getElementById("showLayer3").onchange = function() { map.changeLayer("showLayer3"); twoState(this); };
    document.getElementById("showTriggers").onchange = function() { map.changeLayer("showTriggers"); twoState(this); };
//    document.getElementById("showLayer1").addEventListener("change",  function() { map.changeLayer("showLayer1"); });
//    document.getElementById("showLayer2").addEventListener("change", function() { map.changeLayer("showLayer2"); });
//    document.getElementById("showLayer3").addEventListener("change", function() { map.changeLayer("showLayer3"); });
//    document.getElementById("showTriggers").addEventListener("change", function() { map.changeLayer("showTriggers"); });
    this.showLayer1 = document.getElementById("showLayer1").checked;
    this.showLayer2 = document.getElementById("showLayer2").checked;
    this.showLayer3 = document.getElementById("showLayer3").checked;
    this.showTriggers = document.getElementById("showTriggers").checked;
    this.showCursor = false;
    this.observer = new ROMObserver(rom, this, {sub: true, link: true});
}

FF5Map.prototype.changeZoom = function() {
    
    // save the old scroll location
    var x = this.scrollDiv.parentElement.scrollLeft;
    var y = this.scrollDiv.parentElement.scrollTop;
    var w = this.scrollDiv.parentElement.clientWidth;
    var h = this.scrollDiv.parentElement.clientHeight;
    x = (x + w / 2) / this.zoom;
    y = (y + h / 2) / this.zoom;
    
    this.zoom = Math.pow(2, Number(document.getElementById("zoom").value));
    
    var zoomValue = document.getElementById("zoom-value");
    zoomValue.innerHTML = (this.zoom * 100).toString() + "%";
    
    this.scrollDiv.parentElement.scrollLeft = x * this.zoom - (w >> 1);
    this.scrollDiv.parentElement.scrollTop = y * this.zoom - (h >> 1);
        
    this.scrollDiv.style.width = (this.ppu.width * this.zoom).toString() + "px";
    this.scrollDiv.style.height = (this.ppu.height * this.zoom).toString() + "px";

    this.scroll();
}

FF5Map.prototype.scroll = function() {
    
    // get the visible dimensions
    var x = this.scrollDiv.parentElement.scrollLeft;
    var y = this.scrollDiv.parentElement.scrollTop;
    var w = this.scrollDiv.parentElement.clientWidth;
    var h = this.scrollDiv.parentElement.clientHeight;

    var margin = Math.max(w, h) >> 2;
    this.mapRect.r = Math.min(x + w + margin, this.ppu.width * this.zoom);
    this.mapRect.l = Math.max(0, Math.min(x - margin, this.mapRect.r - w));
    this.mapRect.b = Math.min(y + h + margin, this.ppu.height * this.zoom);
    this.mapRect.t = Math.max(0, Math.min(y - margin, this.mapRect.b - h));
        
    this.canvas.style.left = this.mapRect.l.toString() + "px";
    this.canvas.style.top = this.mapRect.t.toString() + "px";
    this.canvas.width = this.mapRect.w;
    this.canvas.height = this.mapRect.h;

    this.drawMap();
}

FF5Map.prototype.mouseDown = function(e) {
    this.clickedCol = ((e.offsetX / this.zoom + this.ppu.layers[this.l].x) % this.ppu.width) >> 4;
    this.clickedRow = ((e.offsetY / this.zoom + this.ppu.layers[this.l].y) % this.ppu.height) >> 4;
    this.clickButton = e.button;
    
    // update the selection position
    this.selection[1] = this.clickedCol;
    this.selection[2] = this.clickedRow;

    if (this.l === 3) {
        var triggers = this.triggersAt(e.offsetX, e.offsetY);
        var index = triggers.indexOf(this.selectedTrigger);
        if (index !== -1) {
            // select the next trigger in a stack
            this.selectedTrigger = triggers[(index + 1) % triggers.length];
            rom.select(this.selectedTrigger);
            this.clickedCol = this.selectedTrigger.x.value;
            this.clickedRow = this.selectedTrigger.y.value;
        } else if (triggers.length !== 0) {
            // select the first trigger
            this.selectedTrigger = triggers[0];
            rom.select(this.selectedTrigger);
            this.clickedCol = this.selectedTrigger.x.value;
            this.clickedRow = this.selectedTrigger.y.value;
        } else {
            // clear trigger selection selection and select map properties
            this.selectedTrigger = null;
            rom.select(this.mapProperties);
            this.clickedCol = null;
            this.clickedRow = null;
        }
    } else if (this.clickButton === 2) {
        this.selectTiles();
    } else {
        this.rom.beginAction();
        this.rom.pushAction(new ROMAction(this, this.drawMap, null, "Redraw Map"));
        this.rom.doAction(new ROMAction(this.selectedLayer, this.selectedLayer.decodeLayout, null, "Decode Layout"));
        this.setTiles();
    }
    
    this.drawCursor();
}

FF5Map.prototype.mouseUp = function(e) {

    if (this.l === 3 && isNumber(this.clickedCol) && isNumber(this.clickedRow)) {
        // save the new trigger position
        var col = this.selectedTrigger.x.value;
        var row = this.selectedTrigger.y.value;
        
        if (col != this.clickedCol || row !== this.clickedRow) {
            // move the trigger back to its old position
            this.selectedTrigger.x.value = this.clickedCol;
            this.selectedTrigger.y.value = this.clickedRow;

            // set the new trigger position (and trigger undo)
            this.observer.stopObserving(this.selectedTrigger);
            this.rom.beginAction();
            this.selectedTrigger.x.setValue(col);
            this.selectedTrigger.y.setValue(row);
            this.rom.endAction();
            this.observer.startObserving(this.selectedTrigger, this.drawMap);
        }
    } else if (this.rom.action) {
        this.rom.doAction(new ROMAction(this.selectedLayer, null, this.selectedLayer.decodeLayout, "Decode Layout"));
        this.rom.pushAction(new ROMAction(this, null, this.drawMap, "Redraw Map"));
        this.rom.endAction();
    }
    
    this.clickedCol = null;
    this.clickedRow = null;
    this.clickButton = null;
}

FF5Map.prototype.mouseMove = function(e) {
    
    var col = ((e.offsetX / this.zoom + this.ppu.layers[this.l].x) % this.ppu.width) >> 4;
    var row = ((e.offsetY / this.zoom + this.ppu.layers[this.l].y) % this.ppu.height) >> 4;

    // return if the cursor position didn't change
    if (this.selection[1] === col && this.selection[2] === row) return;

    // update the selection position
    this.selection[1] = col;
    this.selection[2] = row;

    if (this.l === 3 && this.selectedTrigger && isNumber(this.clickedCol) && isNumber(this.clickedRow)) {

        if (this.selectedTrigger.x.value !== col || this.selectedTrigger.y.value !== row) {
            this.selectedTrigger.x.value = col;
            this.selectedTrigger.y.value = row;
            this.invalidateMap(this.rectForTrigger(this.selectedTrigger).scale(1 / this.zoom));
            this.drawMap();
        }
    } else if (this.clickButton === 2) {
        this.selectTiles();
    } else {
        this.setTiles();
    }

    // update the cursor
    this.drawCursor();
}

FF5Map.prototype.mouseEnter = function(e) {
    
    // show the cursor
    this.showCursor = true;
    this.drawCursor();

    this.mouseUp(e);
}

FF5Map.prototype.mouseLeave = function(e) {
    
    // hide the cursor
    this.showCursor = (this.l === 3);
    this.drawCursor();
    
    this.mouseUp(e);
}

FF5Map.prototype.setTiles = function() {
    // return if not dragging
    if (!isNumber(this.clickedCol) || !isNumber(this.clickedRow)) return;

    var col = this.selection[1];
    var row = this.selection[2];
    var cols = this.selection[3];
    var rows = this.selection[4];
    
    var l = ((col << 4) - this.ppu.layers[this.l].x) & (this.ppu.width - 1);
    var r = l + (cols << 4);
    var t = ((row << 4) - this.ppu.layers[this.l].y) & (this.ppu.height - 1);
    var b = t + (rows << 4);
    var rect = new Rect(l, r, t, b);

    function invalidate() { this.invalidateMap(rect); }
    this.selectedLayer.setLayout(this.selection);
    this.rom.doAction(new ROMAction(this, invalidate, invalidate, "Invalidate Map"));
    this.drawMap();
}

FF5Map.prototype.selectTiles = function() {
    // return if not dragging
    if (!isNumber(this.clickedCol) || !isNumber(this.clickedRow)) return;
    
    var col = this.selection[1];
    var row = this.selection[2];
    var cols = Math.abs(col - this.clickedCol) + 1;
    var rows = Math.abs(row - this.clickedRow) + 1;
    col = Math.min(col, this.clickedCol);
    row = Math.min(row, this.clickedRow);

    this.selection = this.selectedLayer.getLayout(col, row, cols, rows);
    this.selection[2] |= this.l << 6;
    
    if (rows !== 1 || cols !== 1) {
        this.tileset.selection = null;
    } else {
        // select a single tile in the tileset view
        var tile = this.selection[5];
        this.tileset.selection = new Uint8Array([0x73, tile & 0x0F, tile >> 4, 1, 1, tile]);
    }
    this.tileset.drawCursor();
}

FF5Map.prototype.selectLayer = function(l) {
    // set the selected layer
    l = Number(l);
    if (isNumber(l)) this.l = l;
    
    if (this.m < 5) {
        this.selectedLayer = this.worldLayer;
    } else {
        this.selectedLayer = this.layer[this.l]
    }
    
    this.showCursor = (this.l === 3);
    this.drawCursor();
}

FF5Map.prototype.changeLayer = function(id) {
    this[id] = document.getElementById(id).checked;
    var map = this.rom.mapProperties.item(this.m);
    var colorMath = this.rom.mapColorMath.item(map.colorMath.value);
    this.ppu.layers[0].main = this.showLayer1;
    if (this.m >= 5) {
        this.ppu.layers[0].sub = this.showLayer1 && colorMath.sub1.value;
        this.ppu.layers[1].main = this.showLayer2 && colorMath.main1.value;
        this.ppu.layers[1].sub = this.showLayer2 && colorMath.sub2.value;
        this.ppu.layers[2].main = this.showLayer3 && colorMath.main3.value;
        this.ppu.layers[2].sub = this.showLayer3 && colorMath.sub3.value;
    }
    this.invalidateMap();
    this.drawMap();
}

FF5Map.prototype.drawCursor = function() {
    
    this.cursorCanvas.style.display = "none";
    if (!this.showCursor) return;
    
    var col = this.selection[1];
    var row = this.selection[2];

    // get the cursor geometry and color
    var x = ((col << 4) - this.ppu.layers[this.l].x) & (this.ppu.width - 1);
    x *= this.zoom;
    var y = ((row << 4) - this.ppu.layers[this.l].y) & (this.ppu.height - 1);
    y *= this.zoom;
    var w = this.selection[3] << 4;
    w *= this.zoom;
    var h = this.selection[4] << 4;
    h *= this.zoom;
    var colors = ["green", "blue", "red", "white"];
    var c = colors[this.l];

    // draw the cursor around the selected trigger
    if (this.l === 3) {
        if (!this.selectedTrigger) return;
        x = this.selectedTrigger.x.value * 16 * this.zoom;
        y = this.selectedTrigger.y.value * 16 * this.zoom;
        w = 16 * this.zoom;
        h = 16 * this.zoom;

        if (this.selectedTrigger.vertical) {
            var length = this.selectedTrigger.length.value;
            var vertical = this.selectedTrigger.vertical.value;
            if (vertical) {
                h = 16 * this.zoom * (length);
            } else {
                w = 16 * this.zoom * (length);
            }
        }

        switch (this.selectedTrigger.key) {
            case "eventTriggers": c = "rgba(0, 0, 255, 1.0)"; break;
            case "entranceTriggers": c = "rgba(255, 0, 0, 1.0)"; break;
//            case "entranceTriggersMulti": c = "rgba(0, 128, 0, 1.0)"; break;
            case "treasureProperties": c = "rgba(255, 255, 0, 1.0)"; break;
            case "npcProperties": c = "rgba(128, 128, 128, 1.0)"; break;
        }
    }
    
    // draw the cursor
    w = Math.min(this.ppu.width * this.zoom - x, w);
    h = Math.min(this.ppu.height * this.zoom - y, h);
    if (w <= 0 || h <= 0) return;

    // set up the cursor canvas
    this.cursorCanvas.width = w;
    this.cursorCanvas.height = h;
    this.cursorCanvas.style.left = x.toString() + "px";
    this.cursorCanvas.style.top = y.toString() + "px";
    this.cursorCanvas.style.display = "block";
    var ctx = this.cursorCanvas.getContext('2d');
    
    // convert the selection to screen coordinates
    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    x = 0.5; y = 0.5; w--; h--;
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = c;
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = "white";
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = "black";
    ctx.strokeRect(x, y, w, h);
}

FF5Map.prototype.loadMap = function(m) {
    
    var layerButtons = document.getElementsByClassName("toolbox-button");
    layerButtons[1].disabled = false;
    layerButtons[2].disabled = false;

    // set the map index
    m = Number(m);
    if (isNumber(m) && this.m !== m) {
        this.m = m;
        this.observer.stopObservingAll();
        if (this.m < 5) {
            this.loadWorldMap(this.m);
            return;
        }
        this.mapProperties = this.rom.mapProperties.item(this.m);
        this.observer.startObserving(this.mapProperties, this.loadMap);
    }    

    // get map properties
    var map = this.mapProperties;
    if (!map) return;

    // load graphics
    var gfx = new Uint8Array(0x10000);
    gfx.set(this.rom.mapGraphics.item(map.gfx1.value).data, 0x0000);
    gfx.set(this.rom.mapGraphics.item(map.gfx2.value).data, 0x4000);
    gfx.set(this.rom.mapGraphics.item(map.gfx3.value).data, 0x8000);

    // load animation graphics
    var animGfx = this.rom.mapAnimationGraphics;
    var animGfx2 = this.rom.mapAnimationGraphics2;
    var anim = this.rom.mapAnimationProperties.item(map.tileset.value);
    for (i = 0; i < 8; i++) {
        var flag = anim["flag" + (i + 1).toString()].value;
        var t = anim["tile" + (i + 1).toString()].value;
        if (flag) {
            gfx.set(GFX.decodeSNES4bpp(animGfx.data.subarray(t, t + 0x80)), 0xB800 + i * 0x0100);
        } else {
            gfx.set(GFX.decodeSNES4bpp(animGfx2.data.subarray(t, t + 0x80)), 0xB800 + i * 0x0100);
        }
    }

    // load layer 3 graphics
    var graphicsLayer3 = this.rom.mapGraphicsLayer3.item(map.gfxLayer3.value).data;
    gfx.set(graphicsLayer3, 0xC000);

    // load layer 3 animation graphics
    for (i = 0; i < 4; i++) {
        var flag = anim["flag" + (i + 1).toString() + "Layer3"].value;
        var t = anim["tile" + (i + 1).toString() + "Layer3"].value;
        if (flag) {
            gfx.set(GFX.decodeSNES2bpp(animGfx.data.subarray(t, t + 0x40)), 0xDC00 + i * 0x0100);
        } else {
            gfx.set(GFX.decodeSNES2bpp(animGfx2.data.subarray(t, t + 0x40)), 0xDC00 + i * 0x0100);
        }
    }

    // load palette
    var pal = this.rom.mapPalettes.item(map.palette.value).data;
    pal[0] = 0xFF000000; // set background color to black

    var layout, tileset;
    var tileset = this.rom.mapTilesets.item(map.tileset.value).data;

    // load and de-interlace tile layouts
    if (map.layout1.value) {
        layout = this.rom.mapLayouts.item(map.layout1.value - 1);
        if (layout.lazyData.length === 1) {
            var fill = layout.lazyData[0];
            layout = new Uint16Array(0x1000);
            layout.fill(fill);
        }
    } else {
        layout = new Uint8Array(0x1000);
        layout.fill(1);
    }
    this.layer[0].loadLayout({layout: layout, tileset: tileset, w: 64, h: 64});

    if (map.layout2.value) {
        layout = this.rom.mapLayouts.item(map.layout2.value - 1);
        if (layout.lazyData.length === 1) {
            var fill = layout.lazyData[0];
            layout = new Uint16Array(0x1000);
            layout.fill(fill);
        }
    } else {
        layout = new Uint8Array(0x1000);
        layout.fill(1);
    }
    this.layer[1].loadLayout({layout: layout, tileset: tileset, w: 64, h: 64});

    if (map.layout3.value) {
        layout = this.rom.mapLayouts.item(map.layout3.value - 1);
        if (layout.lazyData.length === 1) {
            var fill = layout.lazyData[0];
            layout = new Uint16Array(0x1000);
            layout.fill(fill);
        }
    } else {
        layout = new Uint8Array(0x1000);
        layout.fill(1);
    }
    this.layer[2].loadLayout({layout: layout, tileset: tileset, w: 64, h: 64});

    // get color math properties
    var colorMath = this.rom.mapColorMath.item(map.colorMath.value);

    // set up the ppu
    this.ppu = new GFX.PPU();
    this.ppu.pal = pal;
    this.ppu.height = 64 * 16;
    this.ppu.width = 64 * 16;
    this.ppu.back = true;
    this.ppu.subtract = colorMath.subtract.value;
    this.ppu.half = colorMath.half.value;

    // layer 1
    this.ppu.layers[0].format = GFX.TileFormat.snes4bppTile;
    this.ppu.layers[0].cols = this.layer[0].w * 2;
    this.ppu.layers[0].rows = this.layer[0].h * 2;
    this.ppu.layers[0].z[0] = GFX.Z.snes1L;
    this.ppu.layers[0].z[1] = GFX.Z.snes1H;
    this.ppu.layers[0].gfx = gfx;
    this.ppu.layers[0].tiles = this.layer[0].tiles;
    this.ppu.layers[0].main = this.showLayer1; // layer 1 always in main screen
    this.ppu.layers[0].sub = this.showLayer1 && colorMath.sub1.value;
    this.ppu.layers[0].math = colorMath.layer1.value;

    // layer 2
    this.ppu.layers[1].format = GFX.TileFormat.snes4bppTile;
    this.ppu.layers[1].cols = this.layer[1].w * 2;
    this.ppu.layers[1].rows = this.layer[1].h * 2;
//    this.ppu.layers[1].x = map.hOffset2.value * 16;
//    this.ppu.layers[1].y = map.vOffset2.value * 16;
    this.ppu.layers[1].z[0] = GFX.Z.snes2L;
    this.ppu.layers[1].z[1] = GFX.Z.snes2H;
    this.ppu.layers[1].gfx = gfx;
    this.ppu.layers[1].tiles = this.layer[1].tiles;
    this.ppu.layers[1].main = this.showLayer2 && colorMath.main2.value;
    this.ppu.layers[1].sub = this.showLayer2 && colorMath.sub2.value;
    this.ppu.layers[1].math = colorMath.layer2.value;

    // layer 3
    this.ppu.layers[2].format = GFX.TileFormat.snes2bppTile;
    this.ppu.layers[2].cols = this.layer[2].w * 2;
    this.ppu.layers[2].rows = this.layer[2].h * 2;
//    this.ppu.layers[2].x = map.hOffset3.value * 16;
//    this.ppu.layers[2].y = map.vOffset3.value * 16;
    this.ppu.layers[2].z[0] = GFX.Z.snes3L;
    this.ppu.layers[2].z[1] = GFX.Z.snes3P; // always high priority layer 3
    this.ppu.layers[2].gfx = gfx.subarray(0xC000);
    this.ppu.layers[2].tiles = this.layer[2].tiles;
    this.ppu.layers[2].main = this.showLayer3 && colorMath.main3.value;
    this.ppu.layers[2].sub = this.showLayer3 && colorMath.sub3.value;
    this.ppu.layers[2].math = colorMath.layer3.value;

    this.scrollDiv.style.width = (this.ppu.width * this.zoom).toString() + "px";
    this.scrollDiv.style.height = (this.ppu.height * this.zoom).toString() + "px";
    this.mapCanvas.width = this.ppu.width;
    this.mapCanvas.height = this.ppu.height;

    this.invalidateMap();
    this.selectedTrigger = null;
    this.loadTriggers();
    this.scroll();
    
    this.tileset.loadMap(m);
}

FF5Map.prototype.loadWorldMap = function(m) {
    
    if (this.selectedLayer && (this.selectedLayer.type === "layer2" || this.selectedLayer.type === "layer3")) {
        this.selectLayer(0);
    }
    var layerButtons = document.getElementsByClassName("toolbox-button");
    layerButtons[1].disabled = true;
    layerButtons[2].disabled = true;

    this.mapProperties = null;
    rom.select(null);

    // load graphics and layout
    var w = 0;
    if (m === 1) w = 1;
    if (m > 2) w = 2;

    var gfx = this.rom.worldGraphics.item(w).data;
    var pal = this.rom.worldPalettes.item(w).data;
    var paletteAssignment = this.rom.worldPaletteAssignments.item(w).data;
    var tileset = this.rom.worldTilesets.item(w).data;

    var layout = [];
    for (var i = 0; i < 256; i++) {
        layout.push(rom.worldLayouts.item(m * 256 + i));
    }
    
    this.worldLayer.loadLayout({layout: layout, tileset: tileset, w: 256, h: 256, paletteAssignment: paletteAssignment});
    
    // set up the ppu
    this.ppu = new GFX.PPU();
    this.ppu.pal = pal;
    this.ppu.width = 256 * 16;
    this.ppu.height = 256 * 16;
    this.ppu.back = true;

    // layer 1
    this.ppu.layers[0].format = GFX.TileFormat.snes4bppTile;
    this.ppu.layers[0].cols = 256 * 2;
    this.ppu.layers[0].rows = 256 * 2;
    this.ppu.layers[0].z[0] = GFX.Z.snes1L;
    this.ppu.layers[0].z[1] = GFX.Z.snes1H;
    this.ppu.layers[0].gfx = gfx;
    this.ppu.layers[0].tiles = this.worldLayer.tiles;
    this.ppu.layers[0].main = this.showLayer1; // layer 1 always in main screen

    this.scrollDiv.style.width = (this.ppu.width * this.zoom).toString() + "px";
    this.scrollDiv.style.height = (this.ppu.height * this.zoom).toString() + "px";
    this.mapCanvas.width = this.ppu.width;
    this.mapCanvas.height = this.ppu.height;
    
    this.invalidateMap();
    this.selectedTrigger = null;
    this.loadTriggers();
    this.scroll();

    this.tileset.loadMap(m);
}

FF5Map.prototype.invalidateMap = function(rect) {
    if (!rect) {
        // invalidate all sectors
        var sectorCount = (this.ppu.width >> 8) * (this.ppu.height >> 8);
        this.mapSectors = new Array(sectorCount);
        this.dirtyRect = null;
    } else if (this.dirtyRect) {
        // combine dirty areas
        var left = Math.min(this.dirtyRect.l, rect.l);
        var top = Math.min(this.dirtyRect.t, rect.t);
        var right = Math.max(this.dirtyRect.r, rect.r);
        var bottom = Math.max(this.dirtyRect.b, rect.b);
        this.dirtyRect = new Rect(left, right, top, bottom);
    } else {
        // set a new dirty area
        this.dirtyRect = rect;
    }
}

FF5Map.prototype.drawMap = function() {
        
    // update the map canvas
    var mapContext = this.mapCanvas.getContext('2d');
    var imageData;

    // draw all visible sectors
    for (var s = 0; s < this.mapSectors.length; s++) {
        // continue if this sector is already drawn
        if (this.mapSectors[s]) continue;
        
        // continue if this sector is not visible
        var col = s % (this.ppu.width >> 8);
        var row = (s / (this.ppu.width >> 8)) | 0;
        var l = col << 8;
        var r = l + 256;
        var t = row << 8;
        var b = t + 256;
        var sectorRect = new Rect(l, r, t, b);
        if (this.mapRect.intersect(sectorRect.scale(this.zoom)).isEmpty()) continue;
        
        // draw the sector (256 x 256 pixels)
        imageData = mapContext.createImageData(256, 256);
        this.ppu.renderPPU(imageData.data, sectorRect.l, sectorRect.t, 256, 256);
//        mapContext.clearRect(sectorRect.l, sectorRect.t, sectorRect.w, sectorRect.h);
        mapContext.putImageData(imageData, sectorRect.l, sectorRect.t);
        
        // validate the sector
        this.mapSectors[s] = true;
    }
    
    // redraw dirty portions of the map
    if (this.dirtyRect) {
    
        var rect = this.dirtyRect;
        this.dirtyRect = null;

        // render the image on the map canvas
        imageData = mapContext.createImageData(rect.w, rect.h);
        this.ppu.renderPPU(imageData.data, rect.l, rect.t, rect.w, rect.h);
//        mapContext.clearRect(rect.l, rect.t, rect.w, rect.h);
        mapContext.putImageData(imageData, rect.l, rect.t);
    }

    var ctx = this.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    var scaledRect = this.mapRect.scale(1 / this.zoom);
//    ctx.clearRect(scaledRect.l, scaledRect.t, scaledRect.w, scaledRect.h);
    ctx.drawImage(this.mapCanvas, scaledRect.l, scaledRect.t, scaledRect.w, scaledRect.h, 0, 0, this.mapRect.w, this.mapRect.h);
    
    this.drawTriggers();
    this.drawCursor();
}

FF5Map.prototype.loadTriggers = function() {

    var i;
    this.triggers = [];
    this.selectedTrigger = null;
    
    var triggers = this.rom.eventTriggers.item(this.m);
    for (i = 0; i < triggers.array.length; i++) {
        this.triggers.push(triggers.item(i));
        this.observer.startObserving(triggers.item(i), this.drawMap);
    }
    triggers = this.rom.entranceTriggers.item(this.m);
    for (i = 0; i < triggers.array.length; i++) {
        this.triggers.push(triggers.item(i));
        this.observer.startObserving(triggers.item(i), this.drawMap);
    }
    triggers = this.rom.npcProperties.item(this.m);
    for (i = 0; i < triggers.array.length; i++) {
        this.triggers.push(triggers.item(i));
        this.observer.startObserving(triggers.item(i), this.drawMap);
    }
    var start = this.rom.mapTreasures.item(this.m).treasure.value;
    var end = this.rom.mapTreasures.item(this.m + 1).treasure.value;
    triggers = this.rom.treasureProperties;
    for (i = start; i < end; i++) {
        this.triggers.push(triggers.item(i));
        this.observer.startObserving(triggers.item(i), this.drawMap);
    }
}

FF5Map.prototype.drawTriggers = function() {
    
    var zoom = this.zoom;
    var xClient = this.mapRect.l;
    var yClient = this.mapRect.t;
    var ctx = this.canvas.getContext('2d');
    
    // function for drawing trigger rectangles with rounded corners
    function drawTriggerRect(x, y, fill) {
        
        var r = zoom * 2;
        var s = zoom * 16 - 4 + 1;
        x = x * zoom * 16 + 2 - 0.5 - xClient;
        y = y * zoom * 16 + 2 - 0.5 - yClient;
        
        ctx.lineWidth = 1;
        ctx.strokeStyle = "white";
        ctx.fillStyle = fill;
        
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.lineTo(x + s - r, y);
        ctx.arcTo(x + s, y, x + s, y + r, r);
        ctx.lineTo(x + s, y + s - r);
        ctx.arcTo(x + s, y + s, x + s - r, y + s, r);
        ctx.lineTo(x + r, y + s);
        ctx.arcTo(x, y + s, x, y + s - r, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    
    if (!this.showTriggers) return;
    for (var i = 0; i < this.triggers.length; i++) {
        var trigger = this.triggers[i];
        var triggerRect = this.rectForTrigger(trigger);
        if (this.mapRect.intersect(triggerRect).isEmpty()) continue;
        var c = "purple";
        switch (trigger.key) {
            case "eventTriggers":
                c = "rgba(0, 0, 255, 0.5)";
                break;
            case "entranceTriggers":
                c = "rgba(255, 0, 0, 0.5)";
                break;
//            case "entranceTriggersMulti":
//                c = "rgba(0, 128, 0, 0.5)";
//                var length = trigger.length.value;
//                var v = trigger.vertical.value;
//                for (var t = 0; t < length; t++) {
//                    drawTriggerRect(trigger.x.value + (v ? 0 : t), trigger.y.value + (v ? t : 0), c)
//                }
//                continue;
            case "treasureProperties":
                c = "rgba(255, 255, 0, 0.5)";
                break;
            case "npcProperties":
                c = "rgba(128, 128, 128, 0.5)";
                break;
        }
        drawTriggerRect(trigger.x.value, trigger.y.value, c);
    }
    
    // draw npcs (sort by y-coordinate and sprite priority)
//    var npcs = this.triggers.filter(function(trigger) {
//        return (trigger.key === "npcProperties");
//    });
//    npcs = npcs.sort(function(trigger1, trigger2) {
//        var y1 = trigger1.y.value;
//        var y2 = trigger2.y.value;
//        if (y1 !== y2) return y1 - y2;
//        return trigger1.spritePriority.value - trigger2.spritePriority.value;
//    });
//    for (i = 0; i < npcs.length; i++) {
//        var npc = npcs[i];
//        this.drawNPC(npc);
//    }
}

FF5Map.prototype.triggerAt = function(x, y) {
    
    var triggers = this.triggersAt(x, y);
    if (triggers.length === 0) return null;
    return triggers[0];
}

FF5Map.prototype.triggersAt = function (x, y) {
    var left, right, top, bottom, length, vertical;
    var zoom = this.zoom;
    var triggers = [];
    
    for (var i = 0; i < this.triggers.length; i++) {
        var trigger = this.triggers[i];
        left = trigger.x.value * 16 * zoom;
        right = left + 16 * zoom;
        top = trigger.y.value * 16 * zoom;
        bottom = top + 16 * zoom;
        
        if (trigger.vertical) {
            length = trigger.length.value;
            vertical = trigger.vertical.value;
            if (vertical) {
                bottom = top + 16 * zoom * (length);
            } else {
                right = left + 16 * zoom * (length);
            }
        }
        
        if (x >= left && x < right && y >= top && y < bottom)
            triggers.push(trigger);        
    }
    return triggers;
}

FF5Map.prototype.rectForTrigger = function(trigger) {
    var l = trigger.x.value * 16 * this.zoom;
    var r = l + 16 * this.zoom;
    var t = trigger.y.value * 16 * this.zoom;
    var b = t + 16 * this.zoom;
    
    if (trigger.vertical) {
        var length = trigger.length.value;
        var vertical = trigger.vertical.value;
        if (vertical) {
            b = t + 16 * this.zoom * (length + 1);
        } else {
            r = l + 16 * this.zoom * (length + 1);
        }
    }

    return new Rect(l, r, t, b);
}

//FF5Map.prototype.drawNPC = function(npc) {
//    
//    var x = npc.x.value * 16;
//    var y = npc.y.value * 16 - 16;
//    var w = 16;
//    var h = 24;
//
//    var vehicle = npc.vehicle.value;
//    var showRider = npc.showRider.value;
//    var direction = npc.direction.value;
//    var animation = npc.animation.value;
//    var frameIndex = 0;
//    var tileCount = 6;
//    var is32x32 = false;
//    var hFlip = false;
//    var special = (vehicle === 0 && npc.special.value);
//
//    if (special) {
//        // special npc
//        is32x32 = npc.is32x32.value;
//        hFlip = npc.hFlip.value;
//        var offset = 0;
//        
//        offset = npc.offset.value * 2;
//        if (npc.slave.value) {
//            var m = npc.master.value;
//            if (!npc.parent.array || m >= npc.parent.array.length) {
//                this.rom.log("Invalid Master NPC");
//            } else {
//                var master = npc.parent.array[m];
//                x = master.x.value * 16;
//                y = master.y.value * 16 - 16;
//                offset = npc.offset.value * 16;
//            }
//        }
//        
//        if (npc.offsetDirection.value) {
//            y += offset;
//        } else {
//            x += offset;
//        }
//        y += 8;
//        
//        if (is32x32) {
//            tileCount = 16;
//            w = 32; h = 32;
//        } else {
//            tileCount = 4;
//            w = 16; h = 16;
//        }
//    } else if (animation === 0) {
//        // normal npc
//        var facingFrames = [0x04, 0x47, 0x01, 0x07];
//        if ((vehicle === 1) || (vehicle === 2)) {
//            // show riding frame when facing left or right on a vehicle (except raft)
//            facingFrames[1] = 0x6E;
//            facingFrames[3] = 0x2E;
//        }
//        frameIndex = facingFrames[direction];
//        if (frameIndex & 0x40) hFlip = true;
//    } else if (animation === 2) {
//        frameIndex = 0x32;
//    } else if (animation === 3) {
//        frameIndex = 0x28;
//    }
//    
//    // get the sprite tile layout
//    var tileLayout = this.rom.mapSpriteLayouts.item(frameIndex & 0x3F);
//
//    // get a pointer to the sprite graphics
//    var gfxPointerLo = this.rom.mapSpritePointersLo.item(npc.graphics.value).pointer.value;
//    var gfxPointerHi = this.rom.mapSpritePointersHi.item(npc.graphics.value).pointer.value;
//    var gfxPointer = gfxPointerLo | (gfxPointerHi << 16);
//    gfxPointer &= 0x00FFFFFF;
//    gfxPointer -= this.rom.unmapAddress(this.rom.mapSpriteGraphics.range.begin);
////    gfxPointer -= isGBA ? 0xF60000 : rom.mapMode.unmapAddress(mapSpriteGraphics.range!.lowerBound)
//
//    // decode graphics
//    var p = npc.palette.value << 9;
//    var gfx = new Uint8Array(0x8000);
//    var tileData = new Uint16Array(tileCount);
//    for (var t = 0; t < tileCount; t++) {
//        var tileOffset = gfxPointer + (special ? t * 0x20 : tileLayout["tile" + (t + 1)].value);
//        var rawGraphics = this.rom.mapSpriteGraphics.data.subarray(tileOffset, tileOffset + 0x20);
//        gfx.set(GFX.decodeSNES4bpp(rawGraphics), t * 0x40);
//        if (hFlip) {
//            tileData[t ^ (is32x32 ? 3 : 1)] = t | p | 0x4000;
//        } else {
//            tileData[t] = t | p;
//        }
//    }
//
//    // load palette
//    var pal = new Uint32Array(0x80);
////    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(npc.palette.value).data));
//    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(0).data), 0x00);
//    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(1).data), 0x10);
//    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(2).data), 0x20);
//    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(3).data), 0x30);
//    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(4).data), 0x40);
//    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(5).data), 0x50);
//    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(6).data), 0x60);
//    pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(7).data), 0x70);
//
//    function drawVehicle() {
//        if (vehicle === 0) return;
//        if (special) return;
//        if (animation) return;
//
//        var vx = x;
//        var vy = y;
//        var vw = 32;
//        var vh = 32;
//        var vp = 7; // vehicle palette
//        
//        // get the vehicle tile layout
//        var vehicleTiles = new Uint16Array(16);
//        if (vehicle === 1) {
//            // chocobo
//            switch (direction) {
//
//                case 0: // up
//                    vehicleTiles.set([
//                        0x2F4C, 0x2F4D,
//                        0x2F5C, 0x2F5D,
//                        0x2F4E, 0x2F4F,
//                        0x2F5E, 0x2F5F]);
//                    vw = 16;
//                    h = 16;
//                    y -= 3;
//                    break;
//
//                case 1: // right
//                    vehicleTiles.set([
//                        0x6F69, 0x6F68, 0x6F65, 0x6F64,
//                        0x6F79, 0x6F78, 0x6F75, 0x6F74,
//                        0x6F6B, 0x6F6A, 0x6F67, 0x6F66,
//                        0x6F7B, 0x6F7A, 0x6F77, 0x6F76]);
//                    vx -= 8;
//                    x -= 3;
//                    y -= 4;
//                    break;
//
//                case 2: // down
//                    vehicleTiles.set([
//                        0x2F42, 0x2F43,
//                        0x2F52, 0x2F53,
//                        0x2F44, 0x2F45,
//                        0x2F54, 0x2F55]);
//                    vw = 16;
//                    h = 16;
//                    y -= 5;
//                    break;
//
//                case 3: // left
//                    vehicleTiles.set([
//                        0x2F64, 0x2F65, 0x2F68, 0x2F69,
//                        0x2F74, 0x2F75, 0x2F78, 0x2F79,
//                        0x2F66, 0x2F67, 0x2F6A, 0x2F6B,
//                        0x2F76, 0x2F77, 0x2F7A, 0x2F7B]);
//                    vx -= 8;
//                    x += 3;
//                    y -= 4;
//                    break;
//            }
//
//        } else if (vehicle === 2) {
//            // magitek
//            vx -= 8;
//            h = 16;
//            y -= 6;
//
//            switch (direction) {
//                case 0:
//                    vehicleTiles.set([
//                    0x2FAC, 0x2FAD, 0x6FAD, 0x6FAC,
//                    0x2FBC, 0x2FBD, 0x6FBD, 0x6FBC,
//                    0x2FAE, 0x2FAF, 0x6FAF, 0x6FAE,
//                    0x2FBE, 0x2FBF, 0x6FBF, 0x6FBE]);
//                    break;
//
//                case 1:
//                    vehicleTiles.set([
//                    0x6FCB, 0x6FCA, 0x6FC9, 0x6FC8,
//                    0x6FDB, 0x6FDA, 0x6FD9, 0x6FD8,
//                    0x6FCF, 0x6FCE, 0x6FCD, 0x6FCC,
//                    0x6FDF, 0x6FDE, 0x6FDD, 0x6FDC]);
//                    break;
//
//                case 2:
//                    vehicleTiles.set([
//                    0x2FA0, 0x2FA1, 0x6FA1, 0x6FA0,
//                    0x2FB0, 0x2FB1, 0x6FB1, 0x6FB0,
//                    0x2FA2, 0x2FA3, 0x6FA3, 0x6FA2,
//                    0x2FB2, 0x2FB3, 0x6FB3, 0x6FB2]);
//                    break;
//
//                case 3:
//                    vehicleTiles.set([
//                    0x2FC8, 0x2FC9, 0x2FCA, 0x2FCB,
//                    0x2FD8, 0x2FD9, 0x2FDA, 0x2FDB,
//                    0x2FCC, 0x2FCD, 0x2FCE, 0x2FCF,
//                    0x2FDC, 0x2FDD, 0x2FDE, 0x2FDF]);
//                    break;
//            }
//
//        } else if (vehicle === 3) {
//            // raft
//            vx -= 8;
//            y -= 8;
//            vp = 11;
//            
//            switch (direction) {
//                case 0:
//                case 2:
//                    vehicleTiles.set([
//                    0x2F20, 0x2F21, 0x2F24, 0x2F25,
//                    0x2F30, 0x2F31, 0x2F34, 0x2F35,
//                    0x2F22, 0x2F23, 0x2F26, 0x2F27,
//                    0x2F32, 0x2F33, 0x2F36, 0x2F37]);
//                    break;
//
//                case 1:
//                case 3:
//                    vehicleTiles.set([
//                    0x2F28, 0x2F29, 0x2F2C, 0x2F2D,
//                    0x2F38, 0x2F39, 0x2F3C, 0x2F3D,
//                    0x2F2A, 0x2F2B, 0x2F2E, 0x2F2F,
//                    0x2F3A, 0x2F3B, 0x2F3E, 0x2F3F]);
//                    break;
//            }
//        }
//        
//        var vehicleRect = new Rect(vx, vx + vw, vy, vy + vh);
//        vehicleRect = vehicleRect.scale(this.zoom);
//        if (this.mapRect.intersect(vehicleRect).isEmpty()) return;
//
//        // load vehicle graphics
//        var vehicleGraphics = GFX.decodeSNES4bpp(this.rom.vehicleGraphics.data.subarray(0, 0x1C00));
//        gfx.set(vehicleGraphics, 0x4800);
//
//        // load vehicle palette
//        pal.set(GFX.decodeBGR555(this.rom.mapSpritePalettes.item(vp).data), 0x70);
//
//        // set up the ppu
//        var ppu = new GFX.PPU();
//        ppu.pal = pal;
//        ppu.width = vw;
//        ppu.height = vh;
//
//        // layer 1
//        ppu.layers[0].format = GFX.TileFormat.snesSpriteTile;
//        ppu.layers[0].cols = vw >> 3;
//        ppu.layers[0].rows = vh >> 3;
//        ppu.layers[0].z[0] = GFX.Z.snesS0;
//        ppu.layers[0].z[1] = GFX.Z.snesS1;
//        ppu.layers[0].z[2] = GFX.Z.snesS2;
//        ppu.layers[0].z[3] = GFX.Z.snesS3;
//        ppu.layers[0].gfx = gfx;
//        ppu.layers[0].tiles = vehicleTiles;
//        ppu.layers[0].main = true;
//
//        // draw the vehicle
//        this.npcCanvas.width = vw;
//        this.npcCanvas.height = vh;
//        var npcContext = this.npcCanvas.getContext('2d');
//        var imageData = npcContext.createImageData(vw, vh);
//        ppu.renderPPU(imageData.data);
//        npcContext.putImageData(imageData, 0, 0);
//
//        var ctx = this.canvas.getContext('2d');
//        ctx.imageSmoothingEnabled = false;
//        ctx.webkitImageSmoothingEnabled = false;
//        vehicleRect = vehicleRect.offset(-this.mapRect.l, -this.mapRect.t);
//        ctx.drawImage(this.npcCanvas, 0, 0, vw, vh, vehicleRect.l, vehicleRect.t, vehicleRect.w, vehicleRect.h);
//    }
//    
//    function drawSprite() {
//        
//        if (vehicle && !showRider && !special && !animation) return;
//        
//        var npcRect = new Rect(x, x + w, y, y + h);
//        npcRect = npcRect.scale(this.zoom);
//        if (this.mapRect.intersect(npcRect).isEmpty()) return;
//
//        // set up the ppu
//        var ppu = new GFX.PPU();
//        ppu.pal = pal;
//        ppu.width = w;
//        ppu.height = h;
//
//        // layer 1
//        ppu.layers[0].format = GFX.TileFormat.snesSpriteTile;
//        ppu.layers[0].cols = w >> 3;
//        ppu.layers[0].rows = h >> 3;
//        ppu.layers[0].z[0] = GFX.Z.snesS0;
//        ppu.layers[0].z[1] = GFX.Z.snesS1;
//        ppu.layers[0].z[2] = GFX.Z.snesS2;
//        ppu.layers[0].z[3] = GFX.Z.snesS3;
//        ppu.layers[0].gfx = gfx;
//        ppu.layers[0].tiles = tileData;
//        ppu.layers[0].main = true;
//
//        // draw the npc
//        this.npcCanvas.width = w;
//        this.npcCanvas.height = h;
//        var npcContext = this.npcCanvas.getContext('2d');
//        var imageData = npcContext.createImageData(w, h);
//        ppu.renderPPU(imageData.data);
//        npcContext.putImageData(imageData, 0, 0);
//
//        var ctx = this.canvas.getContext('2d');
//        ctx.imageSmoothingEnabled = false;
//        ctx.webkitImageSmoothingEnabled = false;
//        npcRect = npcRect.offset(-this.mapRect.l, -this.mapRect.t);
//        ctx.drawImage(this.npcCanvas, 0, 0, w, h, npcRect.l, npcRect.t, npcRect.w, npcRect.h);
//    }
//    
//    function drawTail() {
//        if (vehicle !== 1) return;
//        if (animation) return;
//
//        var tx = x;
//        var ty = y + 12;
//        var tw = 16;
//        var th = 16;
//        
//        // get the tail/head tile layout
//        var tailTiles = new Uint16Array(4);
//        switch (direction) {
//
//            case 0: // up
//                tailTiles.set([
//                    0x2F4A, 0x2F4B,
//                    0x2F5A, 0x2F5B]);
//                ty += 1;
//                break;
//
//            case 2: // down
//                tailTiles.set([
//                    0x2F40, 0x2F41,
//                    0x2F50, 0x2F51]);
//                break;
//
//            default: return;
//        }
//
//        var tailRect = new Rect(tx, tx + tw, ty, ty + th);
//        tailRect = tailRect.scale(this.zoom);
//        if (this.mapRect.intersect(tailRect).isEmpty()) return;
//
//        // set up the ppu
//        var ppu = new GFX.PPU();
//        ppu.pal = pal;
//        ppu.width = tw;
//        ppu.height = th;
//
//        // layer 1
//        ppu.layers[0].format = GFX.TileFormat.snesSpriteTile;
//        ppu.layers[0].cols = 2;
//        ppu.layers[0].rows = 2;
//        ppu.layers[0].z[0] = GFX.Z.snesS0;
//        ppu.layers[0].z[1] = GFX.Z.snesS1;
//        ppu.layers[0].z[2] = GFX.Z.snesS2;
//        ppu.layers[0].z[3] = GFX.Z.snesS3;
//        ppu.layers[0].gfx = gfx;
//        ppu.layers[0].tiles = tailTiles;
//        ppu.layers[0].main = true;
//
//        // draw the vehicle
//        this.npcCanvas.width = tw;
//        this.npcCanvas.height = th;
//        var npcContext = this.npcCanvas.getContext('2d');
//        var imageData = npcContext.createImageData(tw, th);
//        ppu.renderPPU(imageData.data);
//        npcContext.putImageData(imageData, 0, 0);
//
//        var ctx = this.canvas.getContext('2d');
//        ctx.imageSmoothingEnabled = false;
//        ctx.webkitImageSmoothingEnabled = false;
//        tailRect = tailRect.offset(-this.mapRect.l, -this.mapRect.t);
//        ctx.drawImage(this.npcCanvas, 0, 0, tw, th, tailRect.l, tailRect.t, tailRect.w, tailRect.h);
//    }
//
//    drawVehicle.call(this);
//    drawSprite.call(this);
//    drawTail.call(this);
//}

// FF5MapTileset
function FF5MapTileset(rom, map) {

    this.rom = rom;
    this.map = map;
    this.canvas = document.getElementById("tileset");
    this.cursorCanvas = document.getElementById("tileset-cursor");

    this.layer = [new FF5MapLayer(rom, FF5MapLayer.Type.layer1),
                  new FF5MapLayer(rom, FF5MapLayer.Type.layer2),
                  new FF5MapLayer(rom, FF5MapLayer.Type.layer3)];
    this.worldLayer = new FF5MapLayer(rom, FF5MapLayer.Type.world);

    this.selection = new Uint8Array([0x73, 0, 0, 1, 1, 0]);
    this.clickedCol = null;
    this.clickedRow = null;
    
    this.ppu = new GFX.PPU();

    var tileset = this;
    this.canvas.onmousedown = function(e) { tileset.mouseDown(e) };
    this.canvas.onmouseup = function(e) { tileset.mouseUp(e) };
    this.canvas.onmousemove = function(e) { tileset.mouseMove(e) };
    this.canvas.onmouseout = function(e) { tileset.mouseOut(e) };
    this.canvas.oncontextmenu = function() { return false; };
    var tilesetButtons = document.getElementsByClassName("toolbox-button")
    for (var i = 0; i < tilesetButtons.length; i++) {
        var button = tilesetButtons[i];
        button.onclick = function() { tileset.selectLayer(this.value); };
//        button.addEventListener("click", function() { tileset.selectLayer(this.value); });
    }
}

FF5MapTileset.prototype.mouseDown = function(e) {
    var x = e.offsetX;
    var y = e.offsetY;
    this.clickedCol = x >> 4;
    this.clickedRow = y >> 4;
    this.mouseMove(e);
}

FF5MapTileset.prototype.mouseUp = function(e) {
    this.clickedCol = null;
    this.clickedRow = null;
}

FF5MapTileset.prototype.mouseOut = function(e) {
    this.mouseUp(e);
}

FF5MapTileset.prototype.mouseMove = function(e) {

    // return unless dragging (except if trigger layer selected)
    if (!isNumber(this.clickedCol) || !isNumber(this.clickedRow) || this.map.l === 3) return;

    var col = Math.min(e.offsetX >> 4, 15);
    var row = Math.min(e.offsetY >> 4, 15);
    if (this.map.m < 5) row = Math.min(row, 11);
    var cols = Math.abs(col - this.clickedCol) + 1;
    var rows = Math.abs(row - this.clickedRow) + 1;
    col = Math.min(col, this.clickedCol);
    row = Math.min(row, this.clickedRow);

    // create the tile selection
    this.selection = new Uint8Array(5 + cols * rows);
    this.selection.set([0x73, col, row, cols, rows]);
    for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
            this.selection[5 + i + j * cols] = col + i + (row + j) * 16;
        }
    }
    
    // redraw the cursor and notify the map
    this.drawCursor();
    this.map.selection = new Uint8Array(this.selection);
}

FF5MapTileset.prototype.selectLayer = function(l) {
    
    // update layer buttons
    var layerButtons = document.getElementsByClassName("toolbox-button");
    for (var i = 0; i < layerButtons.length; i++) {
        // deselect all layer buttons
        layerButtons[i].classList.remove("selected")
    }
    // select the clicked layer
    layerButtons[l].classList.add("selected")

    // set the selected layer
    this.map.selectLayer(l);

    // turn on the selected layer
    this.ppu.layers[0].main = false;
    this.ppu.layers[1].main = false;
    this.ppu.layers[2].main = false;
    
    // render the image on the canvas
    this.canvas.width = 256;
    this.cursorCanvas.width = 256;
    var ctx = this.canvas.getContext('2d');
    if (this.map.l === 3) {
        this.canvas.style.display = "none";
        this.cursorCanvas.style.display = "none";
        this.canvas.parentElement.style.height = "0px";
    } else {
        this.canvas.style.display = "block";
        this.cursorCanvas.style.display = "block";
        if (this.map.m < 5) {
            this.canvas.height = 192;
            this.cursorCanvas.height = 192;
            this.canvas.parentElement.style.height = "192px";
        } else {
            this.canvas.height = 256;
            this.cursorCanvas.height = 256;
            this.canvas.parentElement.style.height = "256px";
        }
        var imageData = ctx.createImageData(this.ppu.width, this.ppu.height);
        this.ppu.layers[this.map.l].main = true;
        this.ppu.renderPPU(imageData.data);
        ctx.putImageData(imageData, 0, 0);
    }
        
    this.drawCursor();
    this.map.selection = new Uint8Array(this.selection);
}

FF5MapTileset.prototype.drawCursor = function() {
    
    // clear the cursor canvas
    var ctx = this.cursorCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.ppu.width, this.ppu.height);

    // return if trigger layer is selected
    if (this.map.l === 3) return;
    if (!this.selection) return;
    
    // get the cursor geometry
    var x = this.selection[1] << 4;
    var y = this.selection[2] << 4;
    var w = this.selection[3] << 4;
    var h = this.selection[4] << 4;

    // draw the cursor
    if (w <= 0 || h <= 0) return;
    
    // convert the selection to screen coordinates
    var colors = ["green", "blue", "red", "white"];
    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    x += 0.5; y += 0.5; w--; h--;
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = colors[this.map.l];
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = "white";
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = "black";
    ctx.strokeRect(x, y, w, h);
}

FF5MapTileset.prototype.loadMap = function(m) {

    // create a sequential tile layout
    var layout = new Uint8Array(256);
    for (var i = 0; i < 256; i++) {
        layout[i] = i;
    }
    
    // set up the ppu
    this.ppu = new GFX.PPU();
    this.ppu.pal = this.map.ppu.pal;
    this.ppu.height = 256;
    this.ppu.width = 256;
    this.ppu.back = true;

    if (this.map.m < 5) {
        this.ppu.height = 192;
        this.worldLayer.loadLayout({layout: layout, tileset: this.map.worldLayer.tileset, w: 16, h: 12, paletteAssignment: this.map.worldLayer.paletteAssignment})
        
        // layer 1
        this.ppu.layers[0].format = GFX.TileFormat.snes4bppTile;
        this.ppu.layers[0].rows = 24;
        this.ppu.layers[0].cols = 32;
        this.ppu.layers[0].z[0] = GFX.Z.snes1L;
        this.ppu.layers[0].z[1] = GFX.Z.snes1H;
        this.ppu.layers[0].gfx = this.map.ppu.layers[0].gfx;
        this.ppu.layers[0].tiles = this.worldLayer.tiles;
        
    } else {
        this.layer[0].loadLayout({layout: layout, tileset: this.map.layer[0].tileset, w: 16, h: 16});
        this.layer[1].loadLayout({layout: layout, tileset: this.map.layer[1].tileset, w: 16, h: 16});
        this.layer[2].loadLayout({layout: layout, tileset: this.map.layer[2].tileset, w: 16, h: 16});
        
        // layer 1
        this.ppu.layers[0].format = GFX.TileFormat.snes4bppTile;
        this.ppu.layers[0].rows = 32;
        this.ppu.layers[0].cols = 32;
        this.ppu.layers[0].z[0] = GFX.Z.snes1L;
        this.ppu.layers[0].z[1] = GFX.Z.snes1H;
        this.ppu.layers[0].gfx = this.map.ppu.layers[0].gfx;
        this.ppu.layers[0].tiles = this.layer[0].tiles;

        // layer 2
        this.ppu.layers[1].format = GFX.TileFormat.snes4bppTile;
        this.ppu.layers[1].rows = 32;
        this.ppu.layers[1].cols = 32;
        this.ppu.layers[1].z[0] = GFX.Z.snes2L;
        this.ppu.layers[1].z[1] = GFX.Z.snes2H;
        this.ppu.layers[1].gfx = this.map.ppu.layers[1].gfx;
        this.ppu.layers[1].tiles = this.layer[1].tiles;

        // layer 3
        this.ppu.layers[2].format = GFX.TileFormat.snes2bppTile;
        this.ppu.layers[2].rows = 32;
        this.ppu.layers[2].cols = 32;
        this.ppu.layers[2].z[0] = GFX.Z.snes3L;
        this.ppu.layers[2].z[1] = GFX.Z.snes3P;
        this.ppu.layers[2].gfx = this.map.ppu.layers[2].gfx;
        this.ppu.layers[2].tiles = this.layer[2].tiles;
    }
    
    this.selectLayer(this.map.l);
}

// FF5MapLayer
function FF5MapLayer(rom, type) {
    this.rom = rom;
    this.type = type;
    this.tileset = null;
}

FF5MapLayer.Type = {
    layer1: "layer1",
    layer2: "layer2",
    layer3: "layer3",
    world: "world"
}

FF5MapLayer.prototype.loadLayout = function(definition) {

    this.layout = definition.layout;
    this.tileset = definition.tileset;
    this.w = definition.w;
    this.h = definition.h;
    this.paletteAssignment = definition.paletteAssignment; // world map only

    // update tiles for the entire map
    this.tiles = new Uint16Array(this.w * this.h * 4);
    this.decodeLayout();
}

FF5MapLayer.prototype.setLayout = function(layout) {

    // layout 0 is always blank
    if (!this.layout.data && this.type !== "world") return;

    var x = layout[1];
    var y = layout[2];
    var w = layout[3];
    var h = layout[4];
    
    x = x % this.w;
    y = y % this.h;
    var clippedW = Math.min(w, this.w - x);
    var clippedH = Math.min(h, this.h - y);
    
    for (var row = 0; row < clippedH; row++) {
        var ls = 5 + row * w;
        var ld = x + (y + row) * this.w;
        if (this.type === "world") {
            if (y + row > 256) break;
            this.layout[y + row].setData(layout.slice(ls, ls + clippedW), x);
        } else {
            if (ld + clippedW > this.layout.data.length) break;
            this.layout.setData(layout.slice(ls, ls + clippedW), ld);
        }
    }
    this.decodeLayout(x, y, clippedW, clippedH);
}

FF5MapLayer.prototype.getLayout = function(col, row, cols, rows) {
    
    // limit the selection rectangle to the size of the layer
    var clippedCol = col % this.w;
    var clippedRow = row % this.h;
    cols = Math.min(cols, this.w - clippedCol);
    rows = Math.min(rows, this.h - clippedRow);

    // create the tile selection
    var layout = this.layout.data || this.layout;
    var selection = new Uint8Array(5 + cols * rows);
    selection.set([0x73, col, row, cols, rows]);
    for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
            if (this.type === "world") {
                selection[5 + x + y * cols] = layout[y + clippedRow].data[x + clippedCol];
            } else {
                selection[5 + x + y * cols] = layout[x + clippedCol + (y + clippedRow) * this.w];
            }
        }
    }
    return selection;
}

FF5MapLayer.prototype.decodeLayout = function(x, y, w, h) {
    
    x = x || 0;
    y = y || 0;
    x %= this.w;
    y %= this.h;
    w = w || this.w;
    h = h || this.h;
    w = Math.min(w, this.w - x);
    h = Math.min(h, this.h - y);
    
//    // layout 0 is always blank
//    if (this.layout.data && this.layout.data.length !== 0x1000) {
//        this.tiles.fill(1);
//        return;
//    }
//    
    switch (this.type) {
        case FF5MapLayer.Type.layer1:
        case FF5MapLayer.Type.layer2:
        case FF5MapLayer.Type.layer3:
            this.decodeMapLayout(x, y, w, h);
            break;
        case FF5MapLayer.Type.world:
            this.decodeWorldLayout(x, y, w, h);
            break;
        default:
            break;
    }
}

FF5MapLayer.prototype.decodeMapLayout = function(x, y, w, h) {
    
    var layout = this.layout.data || this.layout;
    var l = x + y * this.w;
    var t = x * 2 + y * this.w * 4;
    var row, col, tile, i;

    for (row = 0; row < h; row++) {
        for (col = 0; col < w; col++) {
            tile = layout[l + col] * 2;   
            i = t + col * 2;
            if (i > this.tiles.length) return;
            this.tiles[i + 0] = this.tileset[tile + 0x0000] | (this.tileset[tile + 0x0001] << 8);
            this.tiles[i + 1] = this.tileset[tile + 0x0200] | (this.tileset[tile + 0x0201] << 8);
            i += this.w * 2;
            this.tiles[i + 0] = this.tileset[tile + 0x0400] | (this.tileset[tile + 0x0401] << 8);
            this.tiles[i + 1] = this.tileset[tile + 0x0600] | (this.tileset[tile + 0x0601] << 8);
        }
        t += this.w * 4;
        l += this.w;
    }
}

FF5MapLayer.prototype.decodeWorldLayout = function(x, y, w, h) {

    var tileset = new Uint16Array(768);
    for (var i = 0; i < 768; i++) {
        var t = this.tileset[i];
        var p = this.paletteAssignment[t] << 6;
        tileset[i] = t | p;
    }
    
    var layout = this.layout;
    if (layout[0] instanceof ROMAssembly) {
        layout = new Uint8Array(0x10000);
        for (var i = 0; i < 256; i++) {
            layout.set(this.layout[i].data, i * 256);
        }
    }
    var l = x + y * this.w;
    var t = x * 2 + y * this.w * 4;
    var row, col, tile;

    for (row = 0; row < h; row++) {
        for (col = 0; col < w; col++) {
            tile = layout[l + col];   
            if (tile > 0xBF) tile = 0;
            i = t + col * 2;
            if (i > this.tiles.length) return;
            this.tiles[i + 0] = tileset[tile + 0x0000];
            this.tiles[i + 1] = tileset[tile + 0x00C0];
            i += this.w * 2;
            this.tiles[i + 0] = tileset[tile + 0x0180];
            this.tiles[i + 1] = tileset[tile + 0x0240];
        }
        t += this.w * 4;
        l += this.w;
    }
}
