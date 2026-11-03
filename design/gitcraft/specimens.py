"""PRIMORDIA background life — 3D microorganisms rendered with GITCRAFT MeshCraft (Blender, Cycles).

Run through MeshCraft's run_script:  args = {"specimen": "diatom", "out": "/abs/dir", "frames": 16, "size": 256}
Each specimen is modelled as real geometry with darkfield-style materials (glowing silhouettes on
black, translucent glass bodies) and rendered as a seamless animation loop of `frames` PNGs with alpha.
design/gitcraft/build_sheets.py packs the frames into the sprite sheets the game loads.
"""
import math, os, random
import bmesh
from mathutils import Vector, Matrix, Euler

A = args  # noqa: F821  (injected by MeshCraft)
NAME = A.get("specimen", "diatom")
OUT = A["out"]
FRAMES = int(A.get("frames", 16))
SIZE = int(A.get("size", 256))
SAMPLES = int(A.get("samples", 40))
os.makedirs(OUT, exist_ok=True)
rng = random.Random(7)

# ───────────── scene ─────────────
bpy.ops.wm.read_factory_settings(use_empty=True)  # noqa: F821
S = bpy.context.scene  # noqa: F821
S.render.engine = "CYCLES"
S.cycles.device = "CPU"
S.cycles.samples = SAMPLES
S.cycles.use_denoising = True
S.cycles.max_bounces = 6
S.cycles.transparent_max_bounces = 24
S.render.film_transparent = True
S.cycles.film_transparent_glass = True
S.render.resolution_x = S.render.resolution_y = SIZE
S.render.image_settings.file_format = "PNG"
S.render.image_settings.color_mode = "RGBA"
S.view_settings.view_transform = "Standard"
S.view_settings.exposure = float(A.get("exposure", -1.9))
world = bpy.data.worlds.new("void")  # noqa: F821
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
S.world = world

cam_data = bpy.data.cameras.new("cam"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 2.6  # noqa: F821
cam = bpy.data.objects.new("cam", cam_data); S.collection.objects.link(cam); S.camera = cam  # noqa: F821


def look(pos, target=(0, 0, 0)):
    cam.location = pos
    d = Vector(target) - Vector(pos)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


look((0, 0, 6))


def light(name, loc, energy, color=(1, 1, 1), size=1.5):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy; ld.color = color; ld.size = size  # noqa: F821
    o = bpy.data.objects.new(name, ld); S.collection.objects.link(o); o.location = loc  # noqa: F821
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


# darkfield: grazing light from around the specimen, nothing from the front
for i in range(4):
    a = i * math.pi / 2 + 0.4
    light(f"rim{i}", (math.cos(a) * 4, math.sin(a) * 4, -0.6 + (i % 2) * 1.2), 70, (0.75, 0.95, 1.0))
light("key", (2.5, 3, 4), 20, (1.0, 0.95, 0.85), 3)

# ───────────── materials ─────────────

def mat_glow(name, color, strength=3.0, edge=2.2, core=0.0, gloss=0.12):
    """Darkfield body: transparent centre, glowing silhouette (Layer Weight facing), a little glass."""
    m = bpy.data.materials.new(name); m.use_nodes = True  # noqa: F821
    nt = m.node_tree; N = nt.nodes; L = nt.links; N.clear()
    out = N.new("ShaderNodeOutputMaterial")
    lw = N.new("ShaderNodeLayerWeight"); lw.inputs[0].default_value = 0.35
    pw = N.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = edge
    L.new(lw.outputs["Facing"], pw.inputs[0])
    addc = N.new("ShaderNodeMath"); addc.operation = "ADD"; addc.inputs[1].default_value = core; addc.use_clamp = True
    L.new(pw.outputs[0], addc.inputs[0])
    em = N.new("ShaderNodeEmission"); em.inputs[0].default_value = (*color, 1); em.inputs[1].default_value = strength
    tr = N.new("ShaderNodeBsdfTransparent")
    mix = N.new("ShaderNodeMixShader")
    L.new(addc.outputs[0], mix.inputs[0]); L.new(tr.outputs[0], mix.inputs[1]); L.new(em.outputs[0], mix.inputs[2])
    gl = N.new("ShaderNodeBsdfGlossy"); gl.inputs[1].default_value = 0.15
    add = N.new("ShaderNodeAddShader")
    gmix = N.new("ShaderNodeMixShader"); gmix.inputs[0].default_value = gloss
    L.new(mix.outputs[0], gmix.inputs[1]); L.new(gl.outputs[0], gmix.inputs[2])
    L.new(gmix.outputs[0], out.inputs[0])
    m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    return m


def mat_emit(name, color, strength=4.0):
    m = bpy.data.materials.new(name); m.use_nodes = True  # noqa: F821
    N = m.node_tree.nodes; N.clear()
    out = N.new("ShaderNodeOutputMaterial"); em = N.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*color, 1); em.inputs[1].default_value = strength
    m.node_tree.links.new(em.outputs[0], out.inputs[0])
    return m


def obj_from_bm(name, bm, mat, parent=None, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()  # noqa: F821
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); S.collection.objects.link(o)  # noqa: F821
    o.data.materials.append(mat)
    if parent: o.parent = parent
    return o


def uv_sphere(name, r, mat, loc=(0, 0, 0), scale=(1, 1, 1), seg=32, ring=16, parent=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=r)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*scale, 1)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return obj_from_bm(name, bm, mat, parent)


def root(name="root"):
    o = bpy.data.objects.new(name, None); S.collection.objects.link(o)  # noqa: F821
    return o


def fib(n, r):
    g = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - (i + 0.5) / n * 2; rad = math.sqrt(1 - y * y); t = g * i
        yield Vector((math.cos(t) * rad * r, y * r, math.sin(t) * rad * r))


def batch_spheres(name, pts, r, mat, parent, seg=8, ring=5):
    bm = bmesh.new()
    for p, rr in pts:
        geom = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=rr if rr else r)
        bmesh.ops.translate(bm, vec=p, verts=geom["verts"])
    return obj_from_bm(name, bm, mat, parent)


# ───────────── specimens ─────────────
R = root()
per_frame = None  # optional callback(frame_phase) for deforming animation


def build_diatom():
    """Centric diatom: a glass pillbox (frustule) with radial costae, areolae and amber plastids."""
    glass = mat_glow("frustule", (0.55, 0.95, 1.0), 3.2, 1.8, 0.04)
    rib = mat_glow("costa", (0.8, 1.0, 1.0), 4.0, 1.2, 0.25)
    plast = mat_emit("plastid", (1.0, 0.62, 0.18), 3.0)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=1.0, radius2=1.0, depth=0.42)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.z) > 0.2 and abs(e.verts[1].co.z) > 0.2], offset=0.12, segments=4, affect="EDGES")
    obj_from_bm("frustule", bm, glass, R)
    bm = bmesh.new()
    for i in range(36):
        a = i / 36 * math.tau
        for z in (0.215, -0.215):
            g = bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.transform(bm, matrix=Matrix.Diagonal((0.62, 0.025, 0.02, 1)), verts=g["verts"])
            bmesh.ops.translate(bm, vec=Vector((0.52, 0, z)), verts=g["verts"])
            bmesh.ops.rotate(bm, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(a, 3, "Z"), verts=g["verts"])
    obj_from_bm("costae", bm, rib, R, smooth=False)
    pts = []
    for ring_i, rr in enumerate((0.3, 0.48, 0.66, 0.84)):
        n = int(10 + ring_i * 9)
        for k in range(n):
            a = (k + ring_i * 0.5) / n * math.tau
            for z in (0.22, -0.22):
                pts.append((Vector((math.cos(a) * rr, math.sin(a) * rr, z)), 0.028))
    batch_spheres("areolae", pts, 0.03, rib, R, 6, 4)
    batch_spheres("plastids", [(Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(-0.1, 0.1))), rng.uniform(0.08, 0.15)) for _ in range(9)], 0.1, plast, R, 10, 6)
    uv_sphere("nucleus", 0.16, mat_glow("nuc", (1.0, 0.9, 0.7), 3, 1.5, 0.15), parent=R)
    return (math.radians(55), 0, 0), "Y"


def build_radiolarian():
    """Spherical radiolarian: a silica lattice shell, a central capsule and radiating spines."""
    lat = mat_glow("lattice", (0.5, 0.9, 1.0), 4.5, 1.0, 0.3)
    cap = mat_glow("capsule", (1.0, 0.55, 0.3), 3.5, 1.6, 0.12)
    spine = mat_glow("spine", (0.7, 1.0, 0.95), 4.0, 1.0, 0.35)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.85)
    o = obj_from_bm("shell", bm, lat, R, smooth=False)
    wf = o.modifiers.new("wf", "WIREFRAME"); wf.thickness = 0.035; wf.use_relative_offset = False
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.58)
    o2 = obj_from_bm("inner", bm, lat, R, smooth=False)
    wf2 = o2.modifiers.new("wf", "WIREFRAME"); wf2.thickness = 0.022
    uv_sphere("capsule", 0.4, cap, parent=R)
    bm = bmesh.new(); ico = bmesh.new(); bmesh.ops.create_icosphere(ico, subdivisions=1, radius=1.0)
    dirs = [v.co.normalized() for v in ico.verts]; ico.free()
    for d in dirs:
        g = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.035, radius2=0.002, depth=0.75)
        bmesh.ops.translate(bm, vec=Vector((0, 0, 0.375)), verts=g["verts"])
        q = Vector((0, 0, 1)).rotation_difference(d)
        bmesh.ops.rotate(bm, cent=Vector((0, 0, 0)), matrix=q.to_matrix(), verts=g["verts"])
        bmesh.ops.translate(bm, vec=d * 0.82, verts=g["verts"])
    obj_from_bm("spines", bm, spine, R, smooth=False)
    cam.data.ortho_scale = 3.4
    return (math.radians(20), math.radians(10), 0), "Z"


def build_volvox():
    """Volvox colony: hundreds of flagellated cells in a jelly sphere, daughter colonies inside."""
    jelly = mat_glow("jelly", (0.45, 1.0, 0.6), 2.0, 2.6, 0.02)
    cell = mat_emit("cell", (0.45, 1.0, 0.35), 3.2)
    dau = mat_glow("daughter", (0.75, 1.0, 0.4), 3.5, 1.4, 0.2)
    dcell = mat_emit("dcell", (0.9, 1.0, 0.4), 4.0)
    uv_sphere("matrix", 1.0, jelly, parent=R, seg=48, ring=24)
    batch_spheres("cells", [(p, 0.032) for p in fib(420, 0.985)], 0.03, cell, R, 6, 4)
    for i, (c, r) in enumerate([((0.35, 0.2, 0.1), 0.27), ((-0.3, -0.25, 0.2), 0.22), ((0.05, -0.1, -0.42), 0.24), ((-0.15, 0.42, -0.15), 0.18)]):
        uv_sphere(f"daughter{i}", r, dau, loc=c, parent=R, seg=24, ring=12)
        batch_spheres(f"dcells{i}", [(Vector(c) + p, 0.022) for p in fib(48, r * 0.92)], 0.02, dcell, R, 5, 3)
    return (math.radians(25), 0, math.radians(15)), "Y"


def build_medusa():
    """Hydromedusa: a pulsing glass bell, four glowing gonads, a manubrium and trailing tentacles."""
    bell_m = mat_glow("bell", (0.55, 0.85, 1.0), 2.6, 2.2, 0.03)
    gon = mat_emit("gonad", (1.0, 0.35, 0.75), 3.6)
    ten_m = mat_emit("tentacle", (0.6, 0.95, 1.0), 2.2)
    rim_m = mat_emit("rim", (0.75, 1.0, 1.0), 5.0)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.05], context="VERTS")
    bell = obj_from_bm("bell", bm, bell_m, R)
    sol = bell.modifiers.new("sol", "SOLIDIFY"); sol.thickness = 0.06
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=False, segments=64, radius=1.0)
    rim = obj_from_bm("rim", bm, rim_m, R, smooth=False)
    sk = rim.modifiers.new("sk", "SKIN") if False else None
    rim_bev = bpy.data.curves.new("rimc", "CURVE"); rim_bev.dimensions = "3D"; rim_bev.bevel_depth = 0.02  # noqa: F821
    sp = rim_bev.splines.new("POLY"); sp.points.add(64)
    for i in range(65):
        a = i / 64 * math.tau; sp.points[i].co = (math.cos(a), math.sin(a), 0, 1)
    rim_o = bpy.data.objects.new("rimring", rim_bev); S.collection.objects.link(rim_o); rim_o.parent = R; rim_o.data.materials.append(rim_m)  # noqa: F821
    bpy.data.objects.remove(rim)  # noqa: F821
    gonads = []
    for i in range(4):
        tc = bpy.data.curves.new(f"g{i}", "CURVE"); tc.dimensions = "3D"; tc.bevel_depth = 0.07  # noqa: F821
        s = tc.splines.new("BEZIER"); s.bezier_points.add(2)
        a0 = i * math.pi / 2 + 0.3
        for k in range(3):
            a = a0 + k * 0.5
            s.bezier_points[k].co = (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.55 - abs(k - 1) * 0.12)
            s.bezier_points[k].handle_left_type = s.bezier_points[k].handle_right_type = "AUTO"
        go = bpy.data.objects.new(f"gonad{i}", tc); S.collection.objects.link(go); go.parent = R; go.data.materials.append(gon)  # noqa: F821
        gonads.append(go)
    uv_sphere("manubrium", 0.18, gon, loc=(0, 0, 0.05), scale=(1, 1, 2.2), parent=R)
    tents = []
    for i in range(16):
        tc = bpy.data.curves.new(f"t{i}", "CURVE"); tc.dimensions = "3D"; tc.bevel_depth = 0.012  # noqa: F821
        s = tc.splines.new("POLY"); s.points.add(19)
        to = bpy.data.objects.new(f"tent{i}", tc); S.collection.objects.link(to); to.parent = R; to.data.materials.append(ten_m)  # noqa: F821
        tents.append((to, s, i / 16 * math.tau))
    cam.data.ortho_scale = 3.6
    look((0, -5.2, 2.2), (0, 0, -0.55))

    def anim(ph):
        c = 0.5 - 0.5 * math.cos(ph * math.tau)  # 0 relaxed .. 1 contracted
        sx = 1.0 - 0.18 * c; sz = 0.78 + 0.22 * c
        bell.scale = (sx, sx, sz); rim_o.scale = (sx * 0.98, sx * 0.98, 1)
        for g in gonads: g.scale = (sx, sx, sz)
        R.location = (0, 0, 0.1 * math.sin(ph * math.tau - 1.2))
        for to, s, a in tents:
            for k in range(20):
                t = k / 19
                wob = math.sin(ph * math.tau * 1 - t * 5 + a * 2) * 0.12 * t
                rr = sx * 0.97 + wob
                s.points[k].co = (math.cos(a) * rr + math.cos(a + 1.3) * wob, math.sin(a) * rr + math.sin(a + 1.3) * wob, -t * (1.9 - 0.35 * c) + 0.02, 1)
    return None, anim


def build_ctenophore():
    """Comb jelly: a glass ovoid with eight comb rows whose cilia diffract light into running rainbows."""
    body = mat_glow("cteno", (0.6, 0.9, 1.0), 2.4, 2.4, 0.03)
    uv_sphere("body", 1.0, body, scale=(0.62, 0.62, 1.0), parent=R, seg=48, ring=24)
    uv_sphere("gut", 0.25, mat_emit("gut", (1.0, 0.6, 0.3), 2.0), scale=(0.6, 0.6, 1.6), parent=R)
    plates = []
    for row in range(8):
        a = row / 8 * math.tau
        for k in range(16):
            t = (k + 0.5) / 16
            v = math.pi * (0.12 + 0.76 * t)
            z = math.cos(v) * 1.0; rr = math.sin(v) * 0.62 + 0.02
            m = mat_emit(f"comb{row}_{k}", (1, 1, 1), 5.0)
            bm = bmesh.new(); g = bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.transform(bm, matrix=Matrix.Diagonal((0.02, 0.11, 0.035, 1)), verts=g["verts"])
            o = obj_from_bm(f"plate{row}_{k}", bm, m, R, smooth=False)
            o.location = (math.cos(a) * rr, math.sin(a) * rr, z); o.rotation_euler = (0, 0, a)
            plates.append((m, row, t))
    cam.data.ortho_scale = 2.8
    look((0, -5, 1.4), (0, 0, 0))

    def anim(ph):
        R.rotation_euler = (math.radians(15), 0, ph * math.tau * 0.25)
        import colorsys
        for m, row, t in plates:
            h = (t * 1.6 - ph * 2 + row * 0.07) % 1.0
            wave = 0.5 + 0.5 * math.sin((t * 3 - ph * 2) * math.tau)
            r, g, b = colorsys.hsv_to_rgb(h, 0.85, 1.0)
            em = m.node_tree.nodes["Emission"]
            em.inputs[0].default_value = (r, g, b, 1); em.inputs[1].default_value = 1.0 + 7.0 * wave ** 3
    return None, anim


rot, axis = {"diatom": build_diatom, "radiolarian": build_radiolarian, "volvox": build_volvox,
             "medusa": build_medusa, "ctenophore": build_ctenophore}[NAME]()

frames = []
for f in range(FRAMES):
    ph = f / FRAMES
    if callable(axis):
        axis(ph)
    else:
        base = Euler(rot).to_matrix().to_4x4()
        spin = Matrix.Rotation(ph * math.tau, 4, axis)
        R.matrix_world = base @ spin
    S.render.filepath = os.path.join(OUT, f"{NAME}_{f:02d}.png")
    bpy.ops.render.render(write_still=True)  # noqa: F821
    frames.append(S.render.filepath)
print({"specimen": NAME, "frames": len(frames), "out": OUT})
