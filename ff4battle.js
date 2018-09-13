//
// ff4battle.js
// created 7/7/2018
//

function FF4Battle(rom) {
    this.rom = rom;
    this.name = "FF4Battle";

    this.b = null; // battle index
    this.bg = 0; // battle background index
    this.battleProperties = null;
    this.ppu = null;
    this.canvas = document.createElement('canvas');
    this.battleCanvas = document.createElement('canvas');
    this.battleCanvas.width = 256;
    this.battleCanvas.height = 256;
    this.monsterCanvas = document.createElement('canvas');
    this.div = document.createElement('div');
    this.div.id = 'map-edit';
    this.div.appendChild(this.canvas);
    
    this.battleRect = new Rect(8, 249, 1, 141);
    this.zoom = 2.0;

    this.selectedMonster = null;
    
    this.observer = new ROMObserver(rom, this, {sub: true, link: true, array: true});

    var self = this;
    this.canvas.onmousedown = function(e) { self.mouseDown(e) };
    this.canvas.onmousemove = function(e) { self.mouseMove(e) };
    this.canvas.onmouseup = function(e) { self.mouseUp(e) };
//    this.canvas.onmouseenter = function(e) { self.mouseEnter(e) };
    this.canvas.onmouseleave = function(e) { self.mouseLeave(e) };
    this.monsterPoint = null;
    this.clickedPoint = null;
}

FF4Battle.prototype.battleName = function(b) {
    var battleProperties = this.rom.battleProperties.item(b);
    var monster1 = battleProperties.monster1.value;
    var monster2 = battleProperties.monster2.value;
    var monster3 = battleProperties.monster3.value;
    var m1 = battleProperties.monster1Count.value
    var m2 = battleProperties.monster2Count.value
    var m3 = battleProperties.monster3Count.value

    if (monster2 === monster3) { m2 += m3; m3 = 0; }
    if (monster1 === monster2) { m1 += m2; m2 = 0; }
    if (monster1 === monster3) { m1 += m3; m3 = 0; }

    var battleName = "";
    if (m1 !== 0) {
        battleName += this.rom.stringTable.monsterName.fString(monster1);
        if (m1 !== 1) battleName += " ×" + m1;
    }
    if (m2 !== 0) {
        if (battleName !== "") battleName += ", ";
        battleName += this.rom.stringTable.monsterName.fString(monster2);
        if (m2 !== 1) battleName += " ×" + m2;
    }
    if (m3 !== 0) {
        if (battleName !== "") battleName += ", ";
        battleName += this.rom.stringTable.monsterName.fString(monster3);
        if (m3 !== 1) battleName += " ×" + m3;
    }
    return battleName;
}

FF4Battle.prototype.mouseDown = function(e) {
    var x = Math.floor(e.offsetX / this.zoom) + this.battleRect.l;
    var y = Math.floor(e.offsetY / this.zoom) + this.battleRect.t;
    this.selectedMonster = this.monsterAtPoint(x, y);

    if (this.selectedMonster) {
        this.clickedPoint = {x: x, y: y};
        var position = this.positionForMonster(this.selectedMonster);
        this.monsterPoint = { x: position.x.value, y: position.y.value };
        
        var m = this.monsterInSlot(this.selectedMonster);
        this.rom.select(this.rom.monsterProperties.item(m));
    } else {
//        this.bg++;
//        if (this.bg > 16) this.bg = 0;
        this.rom.select(this.battleProperties);
    }
    
    this.drawBattle();
}

FF4Battle.prototype.mouseMove = function(e) {
    if (!this.selectedMonster || !this.clickedPoint) return;
    
    var x = Math.floor(e.offsetX / this.zoom) + this.battleRect.l;
    var y = Math.floor(e.offsetY / this.zoom) + this.battleRect.t;
    
    var dx = x - this.clickedPoint.x;
    var dy = y - this.clickedPoint.y;

    var m = this.monsterInSlot(this.selectedMonster);
    var position = this.positionForMonster(this.selectedMonster);
    var monsterX = position.x.value;
    var monsterY = position.y.value;
    var newX = (this.monsterPoint.x + dx) & ~7;
    var newY = (this.monsterPoint.y + dy) & ~7;
    newX = Math.min(136, Math.max(16, newX));
    newY = Math.min(128, Math.max(0, newY));
    
    if (newX === monsterX && newY === monsterY) return;
    
    this.observer.stopObserving(this.battleProperties);
    position.x.value = newX;
    position.y.value = newY;
    this.observer.startObserving(this.battleProperties, this.loadBattle);
    this.drawBattle();
}

FF4Battle.prototype.mouseUp = function(e) {
    
    if (!this.selectedMonster || !this.monsterPoint) return;

    // get the new monster's position properties
    var position = this.positionForMonster(this.selectedMonster);
    
    var newPoint = { x: position.x.value, y: position.y.value };
    var oldPoint = this.monsterPoint;

    this.clickedPoint = null;
    this.monsterPoint = null;

    // return if the monster didn't move
    if (oldPoint.x === newPoint.x && oldPoint.y === newPoint.y) return;

    // temporarily move the monster back to its original position
    position.x.value = oldPoint.x;
    position.y.value = oldPoint.y;

    this.observer.stopObserving(this.battleProperties);
    this.rom.beginAction();
    position.x.setValue(newPoint.x);
    position.y.setValue(newPoint.y);
    this.rom.endAction();
    this.observer.startObserving(this.battleProperties, this.loadBattle);
}

FF4Battle.prototype.mouseLeave = function(e) {
    this.mouseUp(e);
}

FF4Battle.prototype.selectObject = function(object) {
    document.getElementById("tileset-div").classList.add('hidden');
    document.getElementById("tileset-layers").classList.add('hidden');
    this.loadBattle(object.i);
}

FF4Battle.prototype.loadBattle = function(b) {
    b = Number(b);
    if (isNumber(b) && this.b !== b) {
        // battle index has changed
        this.observer.stopObserving(this.battleProperties);
        this.b = b;
        this.battleProperties = this.rom.battleProperties.item(b);
        this.observer.startObserving(this.battleProperties, this.loadBattle);
    }
    
    this.selectedMonster = null;
    this.drawBattle();
}

FF4Battle.prototype.monsterInSlot = function(slot) {
    
    var type = 1;
    var monsterCount = [
        0,
        this.battleProperties.monster1Count.value,
        this.battleProperties.monster2Count.value,
        this.battleProperties.monster3Count.value];
    
    var i = 0;
    while (i < slot) {
        if (monsterCount[type]) {
            monsterCount[type]--;
            i++;
            continue;
        }
        type++;
        if (type > 3) return null;
    }
    
    var m = this.battleProperties["monster" + type].value;
    if (m === 0xFF) return null; // slot is empty

    return m;
}

FF4Battle.prototype.positionForMonster = function(slot) {

    var m = this.monsterInSlot(slot);
    if (m === null) return null; // return if slot is empty

    var gfxProperties = this.rom.monsterGraphicsProperties.item(m);
    
    if (gfxProperties.boss.value) {
        var bossProperties = this.rom.monsterBossProperties.item(gfxProperties.size.value);
        return bossProperties;
    } else {
        // load monster position
        var p = this.battleProperties.monsterPosition.value;
        return this.rom.monsterPosition.item(p).item(slot - 1)
    }
}

FF4Battle.prototype.rectForMonster = function(slot) {
    
    var m = this.monsterInSlot(slot);
    if (m === null) return Rect.emptyRect; // return if slot is empty

    // load monster position
    var position = this.positionForMonster(slot);
    var x = position.x.value;
    var y = position.y.value;

    // load monster size
    var w, h;
    var gfxProperties = this.rom.monsterGraphicsProperties.item(m);
    if (gfxProperties.character.value) {
        w = 16; h = 24;
    } else if (gfxProperties.boss.value) {
        var bossProperties = this.rom.monsterBossProperties.item(gfxProperties.size.value);
        var size = this.rom.monsterSize.item(bossProperties.size.value);
        w = size.width.value * 8;
        h = size.height.value * 8;
        x = bossProperties.x.value;
        y = bossProperties.y.value;
    } else {
        var size = this.rom.monsterSize.item(gfxProperties.size.value);
        w = size.width.value * 8;
        h = size.height.value * 8;
    }
    
    return new Rect(x, x + w, y, y + h);
}

FF4Battle.prototype.monsterAtPoint = function(x, y) {
    
    for (var slot = 8; slot > 0; slot--) {
        if (this.rectForMonster(slot).containsPoint(x, y)) return slot;
    }
    return null;
}

FF4Battle.prototype.drawBattle = function() {
    this.drawBackground();
    for (var slot = 1; slot <= 8; slot++) {
        this.drawMonster(slot);
    }

    this.zoom = this.div.clientWidth / this.battleRect.w;
    
    var scaledRect = this.battleRect.scale(this.zoom);
    this.canvas.width = scaledRect.w;
    this.canvas.height = scaledRect.h;
    
    var ctx = this.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.drawImage(this.battleCanvas, this.battleRect.l, this.battleRect.t, this.battleRect.w, this.battleRect.h, 0, 0, scaledRect.w, scaledRect.h);
}

FF4Battle.prototype.drawMonster = function(slot) {
    
    var m = this.monsterInSlot(slot);
    if (m === null) return; // return if slot is empty
    
    // load graphics properties
    var gfxProperties = this.rom.monsterGraphicsProperties.item(m);

    if (gfxProperties.character.value) {
        return;
    } else if (gfxProperties.boss.value) {
        var bossProperties = this.rom.monsterBossProperties.item(gfxProperties.size.value);

        var size = this.rom.monsterSize.item(bossProperties.size.value);
        var tiles = new Uint16Array(size.width.value * size.height.value);
        var map = this.rom.monsterBossMap.item(bossProperties.map.value).data;
        var p = bossProperties.palette.value;

        for (var t = 0, i = 0; i < map.length; i++) {
            var m = map[i];
            if (m === 0xFF) {
                t++;
                continue;

            } else if (m === 0xFE) {
                t += map[++i];
                continue;

            }

            tiles[t++] = m | 0x0200;
        }
    } else {
        var size = this.rom.monsterSize.item(gfxProperties.size.value);
        var tiles = new Uint16Array(size.width.value * size.height.value);
        for (var t = 0; t < tiles.length; t++) tiles[t] = t | 0x0200;
        var p = gfxProperties.palette.value;
    }

    // decode the graphics
    var bytesPerTile = gfxProperties.is3bpp.value ? 24 : 32;
    var decode = gfxProperties.is3bpp.value ? GFX.decodeSNES3bpp : GFX.decodeSNES4bpp;
    var begin = this.rom.mapAddress(this.rom.monsterGraphics.range.begin) + gfxProperties.graphicsPointer.value;
    var end = begin + 256 * bytesPerTile;
    var gfx = decode(this.rom.data.subarray(begin, end));
    
    // load palette (use palette 1, palette 0 is for transparent tiles)
    var pal = new Uint32Array(32);
    pal.set(this.rom.monsterPalette.item(p).data, 16);
    if (this.rom.isGBA || !gfxProperties.is3bpp.value) pal.set(this.rom.monsterPalette.item(p + 1).data, 24);
    
    // set up the ppu
    var ppu = new GFX.PPU();
    ppu.pal = pal;
    ppu.width = size.width.value * 8;
    ppu.height = size.height.value * 8;

    // layer 1
    ppu.layers[0].format = GFX.TileFormat.snesSpriteTile;
    ppu.layers[0].cols = size.width.value;
    ppu.layers[0].rows = size.height.value;
    ppu.layers[0].z[0] = GFX.Z.snesS0;
    ppu.layers[0].z[1] = GFX.Z.snesS1;
    ppu.layers[0].z[2] = GFX.Z.snesS2;
    ppu.layers[0].z[3] = GFX.Z.snesS3;
    ppu.layers[0].gfx = gfx;
    ppu.layers[0].tiles = tiles;
    ppu.layers[0].main = true;

    // draw the monster
    this.monsterCanvas.width = ppu.width;
    this.monsterCanvas.height = ppu.height;
    var context = this.monsterCanvas.getContext('2d');
    var imageData = context.createImageData(ppu.width, ppu.height);
    ppu.renderPPU(imageData.data);
    context.putImageData(imageData, 0, 0);
    
    // tint the selected monster
    if (this.selectedMonster === slot) {
        // create an offscreen canvas filled with the color
        var tintCanvas = document.createElement('canvas');
        tintCanvas.width = ppu.width;
        tintCanvas.height = ppu.height;
        var ctx = tintCanvas.getContext('2d');
        ctx.fillStyle = 'hsla(210, 100%, 50%, 0.5)';
        ctx.fillRect(0, 0, ppu.width, ppu.height);

        ctx = this.monsterCanvas.getContext('2d');
        ctx.globalCompositeOperation = 'source-atop';
        ctx.drawImage(tintCanvas, 0, 0);
    }
    
    var ctx = this.battleCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    monsterRect = this.rectForMonster(slot);
    ctx.drawImage(this.monsterCanvas, 0, 0, monsterRect.w, monsterRect.h, monsterRect.l, monsterRect.t, monsterRect.w, monsterRect.h);
}

FF4Battle.prototype.tintCanvas = function(canvas, color) {
    // create an offscreen canvas filled with the color
    var tintCanvas = document.createElement('canvas');
    tintCanvas.width = canvas.width;
    tintCanvas.height = canvas.height;
    var ctx = tintCanvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(tintCanvas, 0, 0);
}

FF4Battle.prototype.drawBackground = function() {
    
    // load graphics
    var gfx = new Uint8Array(0x10000);
    gfx.set(this.rom.battleBackgroundGraphics.item(this.bg).data, 0x8040);
    
    var properties = this.rom.battleBackgroundProperties.item(this.bg);
    var tiles = new Uint16Array(0x0400);
    
    // load lower layout
    var layout = new Uint16Array(this.rom.battleBackgroundLayoutLower.item(properties.bottom.value).data);
    for (var i = 0; i < layout.length; i++) {
        layout[i] += properties.offset.value;
    }
    tiles.set(layout, 0x100);
    tiles.set(layout, 0x140);
    tiles.set(layout, 0x180);
    tiles.set(layout, 0x1C0);
    tiles.set(layout, 0x200);
    
    // load upper layouts
    layout = this.rom.battleBackgroundLayoutUpper.item(properties.top.value).data;
    tiles.set(layout);
    if (properties.middle.value) {
        layout = this.rom.battleBackgroundLayoutUpper.item(properties.middle.value).data;
        tiles.set(layout, 0x100);
    }
    
    var pal = new Uint32Array(0x80);
    pal[0] = 0xFF000000;
    pal.set(this.rom.battleBackgroundPalette.item(this.bg).data.subarray(0, 8), 0x10);
    pal.set(this.rom.battleBackgroundPalette.item(this.bg).data.subarray(8, 16), 0x20);
    
    // set up the ppu
    this.ppu = new GFX.PPU();
    this.ppu.pal = pal;
    this.ppu.height = 256;
    this.ppu.width = 256;
    this.ppu.back = true;

    // layer 2
    this.ppu.layers[1].format = GFX.TileFormat.snes4bppTile;
    this.ppu.layers[1].cols = 32;
    this.ppu.layers[1].rows = 32;
    this.ppu.layers[1].z[0] = GFX.Z.snes2L;
    this.ppu.layers[1].z[1] = GFX.Z.snes2H;
    this.ppu.layers[1].gfx = gfx;
    this.ppu.layers[1].tiles = tiles;
    this.ppu.layers[1].main = true;

    var context = this.battleCanvas.getContext('2d');
    imageData = context.createImageData(256, 256);
    this.ppu.renderPPU(imageData.data, 0, 0, 256, 256);
    context.putImageData(imageData, 0, 0);
}