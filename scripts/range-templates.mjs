export function rangeShapes(range, description = "") {
  const choices = new Map();
  const add = (kind,label,length,width = length,reach = null) => {
    if (![length,width,reach ?? 1].every(value=>Number.isFinite(value) && value > 0)) return;
    choices.set(label,{kind,label,length,width,reach});
  };
  for (const part of String(range ?? "").split(/;|\bor\s+(?=(?:self|field|melee|line|close blast|burst|cone|\d)\b)/i)) {
    let match;
    if (match = /\b(\d+(?:\.\d+)?)\s*m?\s*,\s*ranged blast\s+(\d+)/i.exec(part)) {
      add("rangedBlast",`${match[1]} m · Ranged Blast ${match[2]}`,+match[2],+match[2],+match[1]);
    } else if (match = /\b(close blast|burst|line|cone)\s+(\d+(?:\.\d+)?)/i.exec(part)) {
      const kind = match[1].toLowerCase().replace("close blast","closeBlast");
      add(kind,`${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`,+match[2]);
    } else if (/\bmelee\b/i.test(part)) {
      add("reach","Melee reach · 1 m",1);
    } else if (match = /^\s*(\d+(?:\.\d+)?)\s*m?\s*,\s*(\d+)\s*targets?\b/i.exec(part)) {
      add("reach",`${match[1]} m · ${match[2]} target${match[2] === "1" ? "" : "s"}`,+match[1]);
    }
    if (/\bpass\b/i.test(part)) add("line","Pass · up to 4 m",4);
  }
  for (const match of `${range ?? ""} ${description}`.matchAll(/\b(\d+)\s*[x×]\s*(\d+)\s+zone\b/gi)) {
    add("zone",`Zone · ${match[1]} × ${match[2]}`,+match[1],+match[2]);
  }
  return [...choices.values()];
}

export function rangeTemplateData(shape, origin, point, size, units) {
  const rect = (x,y,w,h)=>({t:"rect",x,y,direction:Math.atan2(h,w)*180/Math.PI,distance:Math.hypot(w,h)*units});
  if (shape.kind === "zone" || shape.kind === "rangedBlast" || shape.kind === "closeBlast") {
    return rect(point.x,point.y,shape.length,shape.width);
  }
  if (shape.kind === "reach" || shape.kind === "burst") {
    const radius = shape.length*size;
    return rect(origin.x-radius,origin.y-radius,origin.width/size+2*shape.length,origin.height/size+2*shape.length);
  }
  const dx = point.x-origin.center.x;
  const dy = point.y-origin.center.y;
  if (!dx && !dy) return null;
  const direction = (Math.round(Math.atan2(dy,dx)/(Math.PI/4))*45+360)%360;
  const radians = direction*Math.PI/180;
  const distance = Math.min(shape.length,Math.max(1,Math.round(Math.max(Math.abs(dx),Math.abs(dy))/size)));
  return {t:shape.kind === "cone" ? "cone" : "ray",x:origin.center.x,y:origin.center.y,direction,
    distance:(shape.kind === "cone" ? shape.length : distance*(direction%90 ? Math.SQRT2 : 1))*units,
    ...(shape.kind === "cone" ? {angle:90} : {width:units})};
}

let cancelPlacement;

export function placeRangeTemplate(shape, token, name) {
  const scene = canvas.scene;
  const board = document.getElementById("board");
  if (!scene || !board || !canvas.grid.isSquare) return ui.notifications.warn("PTE range placement requires an active square-grid scene.");
  const Template = CONFIG.MeasuredTemplate.documentClass;
  if (!Template.canUserCreate(game.user)) return ui.notifications.warn("You need permission to create measured templates.");
  if (!token && shape.kind !== "zone") return ui.notifications.warn("Select the move’s source token on the map.");
  const origin = token && {x:token.bounds.x,y:token.bounds.y,width:token.bounds.width,height:token.bounds.height,center:token.center};
  const size = canvas.grid.size;
  const units = scene.grid.distance;
  const aimed = !["reach","burst"].includes(shape.kind);
  const publish = data=>Template.create({...data,fillColor:game.user.color,flags:{"pokemon-tabletop-evolution":{move:name,range:shape.label}}},{parent:scene});
  cancelPlacement?.();
  if (!aimed) return publish(rangeTemplateData(shape,origin,null,size,units));

  const controller = new AbortController();
  const {signal} = controller;
  const cancel = ()=>{controller.abort();clearTimeout(timer);cancelPlacement=null};
  const timer = setTimeout(cancel,45000);
  cancelPlacement=cancel;
  ui.notifications.info("Click the map to place the shape. For Blasts and Zones, click the upper-left square. Press Esc to cancel.");
  window.addEventListener("keydown",event=>{
    if (event.key === "Escape") cancel();
  },{capture:true,signal});
  window.addEventListener("pointerdown",async event=>{
    if (event.target !== board || event.button !== 0) return;
    if (canvas.scene?.id !== scene.id) return cancel();
    event.preventDefault();
    event.stopImmediatePropagation();
    const position = canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
    const offset = canvas.grid.getOffset(position);
    const point = ["line","cone"].includes(shape.kind) ? canvas.grid.getCenterPoint(offset) : canvas.grid.getTopLeftPoint(offset);
    if (shape.kind === "closeBlast" || shape.kind === "rangedBlast") {
      const width = shape.kind === "closeBlast" ? shape.length*size : size;
      const height = shape.kind === "closeBlast" ? shape.width*size : size;
      const dx = Math.max(origin.x-point.x-width+size,point.x-origin.x-origin.width+size,0);
      const dy = Math.max(origin.y-point.y-height+size,point.y-origin.y-origin.height+size,0);
      const distance = Math.max(dx,dy)/size;
      if (shape.kind === "closeBlast" && distance !== 1) {
        return ui.notifications.warn("Place the Close Blast beside the source without overlapping it.");
      }
      if (shape.kind === "rangedBlast" && distance > shape.reach) {
        return ui.notifications.warn(`Place the upper-left square within ${shape.reach} m of the source.`);
      }
    }
    const data = rangeTemplateData(shape,origin,point,size,units);
    if (!data) return;
    cancel();
    try {
      await publish(data);
    } catch (error) {
      console.error("PTE range placement failed",error);
      ui.notifications.error("The range template could not be placed.");
    }
  },{capture:true,signal});
}
