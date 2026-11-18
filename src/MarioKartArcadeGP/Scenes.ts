import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase.js";
import { MeleeRenderer } from "../SuperSmashBrosMelee/Scenes_SuperSmashBrosMelee.js";
import {
    HSD_AnimJointRoot,
    HSD_AObjLoadAnimJoint,
    HSD_AObjLoadMatAnimJoint,
    HSD_AObjLoadShapeAnimJoint,
    HSD_Archive,
    HSD_Archive_FindPublic,
    HSD_ArchiveParse,
    HSD_JObjLoadJoint,
    HSD_LoadContext,
    HSD_LoadContext__ResolvePtr,
    HSD_MatAnimJointRoot,
    HSD_ShapeAnimJointRoot,
} from "../SYSDOLPHIN/SYSDOLPHIN.js";
import { HSD_JObjRoot_Instance } from "../SYSDOLPHIN/SYSDOLPHIN_Render.js";
import * as UI from "../ui.js";
import { assertExists } from "../util.js";
import { SceneGfx } from "../viewer.js";

type HSD_JObj_Instance = HSD_JObjRoot_Instance[`allJObjs`][number];

const pathBase = `MarioKartArcadeGP`;

class MarioKartArcadeGPRenderer extends MeleeRenderer {
    public layers: UI.Layer[] = [];

    public createPanels(): UI.Panel[] {
        return this.layers.length > 0 ? [new UI.LayerPanel(this.layers)] : [];
    }
}

interface LoadedArchiveInfo {
    roots: HSD_JObjRoot_Instance[];
    normalJObjs: HSD_JObj_Instance[];
    reverseJObjs: HSD_JObj_Instance[];
}

function loadSceneDataArchive(renderer: MeleeRenderer, arc: HSD_Archive): LoadedArchiveInfo {
    const info: LoadedArchiveInfo = { roots: [], normalJObjs: [], reverseJObjs: [] };
    const ctx = new HSD_LoadContext(arc);
    const sceneDataSlice = HSD_Archive_FindPublic(arc, `scene_data`);
    if (sceneDataSlice === null)
        return info;

    const sceneData = sceneDataSlice.createDataView();
    const jobjDescsOffs = sceneData.getUint32(0x00);
    if (jobjDescsOffs === 0)
        return info;

    const jobjDescs = HSD_LoadContext__ResolvePtr(ctx, jobjDescsOffs).createDataView();
    for (let i = 0; ; i += 4) {
        const jobjDescOffs = jobjDescs.getUint32(i);
        if (jobjDescOffs === 0)
            break;

        const jobjDesc = HSD_LoadContext__ResolvePtr(ctx, jobjDescOffs).createDataView();
        const rootJointOffs = jobjDesc.getUint32(0x00);
        if (rootJointOffs === 0)
            continue;

        const rootJointData = HSD_LoadContext__ResolvePtr(ctx, rootJointOffs, 0x40);
        const rootJoint = assertExists(HSD_JObjLoadJoint(ctx, rootJointData));
        const rootJointInstance = new HSD_JObjRoot_Instance(renderer.modelCache.loadJObjRoot(rootJoint));

        let jointAnimation: HSD_AnimJointRoot | null = null;
        const jointAnimationsOffs = jobjDesc.getUint32(0x04);
        if (jointAnimationsOffs !== 0) {
            const ptrTable = HSD_LoadContext__ResolvePtr(ctx, jointAnimationsOffs).createDataView();
            const animOffs = ptrTable.getUint32(0x00);
            if (animOffs !== 0)
                jointAnimation = HSD_AObjLoadAnimJoint(ctx, HSD_LoadContext__ResolvePtr(ctx, animOffs));
        }

        let materialAnimation: HSD_MatAnimJointRoot | null = null;
        const materialAnimationsOffs = jobjDesc.getUint32(0x08);
        if (materialAnimationsOffs !== 0) {
            const ptrTable = HSD_LoadContext__ResolvePtr(ctx, materialAnimationsOffs).createDataView();
            const animOffs = ptrTable.getUint32(0x00);
            if (animOffs !== 0)
                materialAnimation = HSD_AObjLoadMatAnimJoint(ctx, HSD_LoadContext__ResolvePtr(ctx, animOffs));
        }

        let shapeAnimation: HSD_ShapeAnimJointRoot | null = null;
        const shapeAnimationsOffs = jobjDesc.getUint32(0x0C);
        if (shapeAnimationsOffs !== 0) {
            const ptrTable = HSD_LoadContext__ResolvePtr(ctx, shapeAnimationsOffs).createDataView();
            const animOffs = ptrTable.getUint32(0x00);
            if (animOffs !== 0)
                shapeAnimation = HSD_AObjLoadShapeAnimJoint(ctx, HSD_LoadContext__ResolvePtr(ctx, animOffs));
        }

        if (jointAnimation !== null || materialAnimation !== null || shapeAnimation !== null)
            rootJointInstance.addAnimAll(jointAnimation, materialAnimation, shapeAnimation);

        for (const sym of arc.publics) {
            const jobj = rootJointInstance.findJObjByJointReferenceID(sym.offset);
            if (jobj === undefined)
                continue;

            if (sym.name.includes(`occlusion`) || sym.name.includes(`atari`) || sym.name.includes(`hani`)) {
                jobj.setVisibleAll(false);
            } else if (sym.name.includes(`reverse`)) {
                jobj.visible = false;
                info.reverseJObjs.push(jobj);
            } else if (sym.name.includes(`normal`)) {
                info.normalJObjs.push(jobj);
            }
        }

        renderer.jobjRoots.push(rootJointInstance);
        info.roots.push(rootJointInstance);
    }
    return info;
}

class MarioKartArcadeGPSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string, private files: string[]) {}

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const dataFetcher = context.dataFetcher;
        const renderer = new MarioKartArcadeGPRenderer(device);

        const buffers = await Promise.all(this.files.map((file) => dataFetcher.fetchData(`${pathBase}/${file}`)));
        const allNormalJObjs: HSD_JObj_Instance[] = [];
        const allReverseJObjs: HSD_JObj_Instance[] = [];

        for (let i = 0; i < buffers.length; i++) {
            const file = this.files[i];
            const arc = HSD_ArchiveParse(buffers[i]);
            const info = loadSceneDataArchive(renderer, arc);
            allNormalJObjs.push(...info.normalJObjs);
            allReverseJObjs.push(...info.reverseJObjs);

            if (info.roots.length > 0) {
                const defaultVisible = file !== `KP_sekizou.dat`;
                for (const r of info.roots) {
                    if (r.allJObjs.length > 0)
                        r.allJObjs[0].visible = defaultVisible;
                }
                const layer: UI.Layer = {
                    name: file,
                    visible: defaultVisible,
                    setVisible(v: boolean) {
                        this.visible = v;
                        for (const r of info.roots) {
                            if (r.allJObjs.length > 0)
                                r.allJObjs[0].visible = v;
                        }
                    },
                };
                renderer.layers.push(layer);
            }
        }

        if (allNormalJObjs.length > 0) {
            renderer.layers.push({
                name: `Normal Route`,
                visible: true,
                setVisible(v: boolean) {
                    this.visible = v;
                    for (const j of allNormalJObjs)
                        j.visible = v;
                },
            });
        }

        if (allReverseJObjs.length > 0) {
            renderer.layers.push({
                name: `Reverse Route`,
                visible: false,
                setVisible(v: boolean) {
                    this.visible = v;
                    for (const j of allReverseJObjs)
                        j.visible = v;
                },
            });
        }

        return renderer;
    }
}

const id = `MarioKartArcadeGP`;
const name = `Mario Kart Arcade GP`;
const sceneDescs = [
    "Mario Cup",
    new MarioKartArcadeGPSceneDesc(`MR_highway_short_day`, `Mario Highway / Mario Beach (Short - Day)`, [
        `MR_highway_short_A.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`MR_highway_short_eve`, `Mario Highway / Mario Beach (Short - Evening)`, [
        `MR_highway_short_B.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`MR_highway_short_night`, `Mario Highway / Mario Beach (Short - Night)`, [
        `MR_highway_short_C.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`MR_highway_long_day`, `Mario Highway / Mario Beach (Long - Day)`, [
        `MR_highway_long_A.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`MR_highway_long_eve`, `Mario Highway / Mario Beach (Long - Evening)`, [
        `MR_highway_long_B.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`MR_highway_long_night`, `Mario Highway / Mario Beach (Long - Night)`, [
        `MR_highway_long_C.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`MH_challenge`, `Mario Cup - Challenge`, [
        `MH_challenge_map.dat`,
        `MH_challenge_obj.dat`,
    ]),

    "DK Cup",
    new MarioKartArcadeGPSceneDesc(`DK_jungle_short_day`, `DK Jungle / Bananan Labyrinth (Short - Day)`, [
        `DK_jungle_short_a.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`DK_jungle_short_eve`, `DK Jungle / Bananan Labyrinth (Short - Evening)`, [
        `DK_jungle_short_b.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`DK_jungle_short_night`, `DK Jungle / Bananan Labyrinth (Short - Night)`, [
        `DK_jungle_short_c.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`DK_jungle_long_day`, `DK Jungle / Bananan Labyrinth (Long - Day)`, [
        `DK_jungle_long_a.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`DK_jungle_long_eve`, `DK Jungle / Bananan Labyrinth (Long - Evening)`, [
        `DK_jungle_long_b.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`DK_jungle_long_night`, `DK Jungle / Bananan Labyrinth (Long - Night)`, [
        `DK_jungle_long_c.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`DK_challenge`, `DK Cup - Challenge`, [
        `DK_jungle_challenge.dat`,
    ]),

    "Wario Cup",
    new MarioKartArcadeGPSceneDesc(`WC_dcity_short_a`, `Diamond City / Snow Panic (Short - Variant A)`, [
        `WC_dcity_short_A.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`WC_dcity_short_b`, `Diamond City / Snow Panic (Short - Variant B)`, [
        `WC_dcity_short_B.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`WC_dcity_short_c`, `Diamond City / Snow Panic (Short - Variant C)`, [
        `WC_dcity_short_C.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`WC_dcity_long_a`, `Diamond City / Snow Panic (Long - Variant A)`, [
        `WC_dcity_long_A.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`WC_dcity_long_b`, `Diamond City / Snow Panic (Long - Variant B)`, [
        `WC_dcity_long_B.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`WC_dcity_long_c`, `Diamond City / Snow Panic (Long - Variant C)`, [
        `WC_dcity_long_C.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`WC_challenge`, `Wario Cup - Challenge`, [
        `WC_challenge_map.dat`,
        `WC_dcity_challenge.dat`,
    ]),

    "Pac-Man Cup",
    new MarioKartArcadeGPSceneDesc(`PC_land_short`, `Pac Mountain / Pac Labyrinth (Short)`, [
        `PC_land_short_a.dat`,
        `PCA_anim_sa.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`PC_land_long`, `Pac Mountain / Pac Labyrinth (Long)`, [
        `PC_land_long_a.dat`,
        `PCA_anim_la.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`PC_challenge`, `Pac-Man Cup - Challenge`, [
        `PL_challenge_map.dat`,
        `PL_challenge_obj.dat`,
        `PC_land_challenge.dat`,
        `PCA_challenge.dat`,
    ]),

    "Bowser Cup",
    new MarioKartArcadeGPSceneDesc(`KP_castle_short`, `Bowser's Castle / Castle Wall (Course A)`, [
        `KP_castle_ground_A.dat`,
        `KP_jkabe.dat`,
        `KP_sekizou.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`KP_castle_long`, `Bowser's Castle / Castle Wall (Course B)`, [
        `KP_castle_ground_B.dat`,
        `KP_jkabe.dat`,
        `KP_sekizou.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`KP_challenge`, `Bowser Cup - Challenge`, [
        `KP_castle_challenge.dat`,
        `KP_challenge_ashi.dat`,
    ]),

    "Rainbow Cup",
    new MarioKartArcadeGPSceneDesc(`RB_road_short_a`, `Rainbow Coaster / Downhill (Short - Variant A)`, [
        `RB_road_short_a.dat`,
        `RBA_anim_a.dat`,
        `RBA_anim_as.dat`,
        `RBA_s_warp.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`RB_road_short_b`, `Rainbow Coaster / Downhill (Short - Variant B)`, [
        `RB_road_short_b.dat`,
        `RBA_anim_a.dat`,
        `RBA_anim_aurora.dat`,
        `RBA_s_warp.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`RB_road_short_c`, `Rainbow Coaster / Downhill (Short - Variant C)`, [
        `RB_road_short_c.dat`,
        `RBA_anim_a.dat`,
        `RBA_s_warp.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`RB_road_short_d`, `Rainbow Coaster / Downhill (Short - Variant D)`, [
        `RB_road_short_d.dat`,
        `RBA_anim_a.dat`,
        `RBA_s_warp.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`RB_road_long_a`, `Rainbow Coaster / Downhill (Long - Variant A)`, [
        `RB_road_long_a.dat`,
        `RBA_anim_a.dat`,
        `RBA_anim_al.dat`,
        `RBA_l_warp.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`RB_road_long_b`, `Rainbow Coaster / Downhill (Long - Variant B)`, [
        `RB_road_long_b.dat`,
        `RBA_anim_a.dat`,
        `RBA_anim_auroralong.dat`,
        `RBA_l_warp.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`RB_road_long_c`, `Rainbow Coaster / Downhill (Long - Variant C)`, [
        `RB_road_long_c.dat`,
        `RBA_anim_a.dat`,
        `RBA_l_warp.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`RB_road_long_d`, `Rainbow Coaster / Downhill (Long - Variant D)`, [
        `RB_road_long_d.dat`,
        `RBA_anim_a.dat`,
        `RBA_l_warp.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`RL_challenge`, `Rainbow Cup - Challenge`, [
        `RL_challenge_map.dat`,
        `RBA_anim_a.dat`,
    ]),

    "Development",
    new MarioKartArcadeGPSceneDesc(`test_course`, `Test Course`, [
        `test_course_road.dat`,
        `test_course_ground.dat`,
        `test_course_start_gate.dat`,
        `test_course_f_ship.dat`,
        `test_course_coconut.dat`,
        `test_course_bm.dat`,
    ]),
];

export const sceneGroup: SceneGroup = { id, name, sceneDescs };
