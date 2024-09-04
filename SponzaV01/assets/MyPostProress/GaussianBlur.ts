import { _decorator, gfx, postProcess, Material, EffectAsset, renderer, rendering, Vec4 } from 'cc';
const { Format  } = gfx

const { ccclass, property, menu, executeInEditMode } = _decorator;

@ccclass('GaussianBlur')
@menu('PostProcess/GaussianBlur')
@executeInEditMode
export class GaussianBlur extends postProcess.PostProcessSetting{

    @property(EffectAsset)
    _effectAsset: EffectAsset | undefined

    @property(EffectAsset)
    get effect () {
        return this._effectAsset;
    }
    set effect (v) {
        this._effectAsset = v;
        if(this._effectAsset == null){
            this._material = null;
        }
        else{
            if(this._material == null){
                this._material = new Material();
            }
            this._material.reset({effectAsset:this._effectAsset});
        }
        this.updateMaterial();
    }
    
    @property
    iterations = 3;

    @property
    get blurRadius(){
        return this._blurParams.x;
    }
    set blurRadius(v){
        this._blurParams.x = v;
        this.updateMaterial();
    }


    private _material:Material;
    public get material():Material{
        return this._material;
    }

    @property
    private _blurParams:Vec4 = new Vec4(1.0,0.0,0.0,0.0);
    public get blurParams():Vec4{
        return this._blurParams;
    }

    updateMaterial(){
        if(!this._material){
            return;
        }
        this._material.setProperty('blurParams', this.blurParams);
    }

    protected start(): void {
        if(this._effectAsset){
            this._material = new Material();
            this._material.initialize({effectAsset:this._effectAsset});
            this._material.setProperty('blurParams', this.blurParams);
        }
    }
}

/*      
        get setting：获取配置信息，对应的就是上面实现的界面组件
        checkEnable：用于判断此后效是否开启
        name：后效的名字，一般保持和类名一致即可
        outputNames：最终输出的 RT 数组。（临时用的 RT 不用放在这里）
        render：用于执行渲染流程 
*/
export class GaussianBlurPass extends postProcess.SettingPass {
    get setting () { return this.getSetting(GaussianBlur); }

    checkEnable (camera: renderer.scene.Camera) {
        let enable = super.checkEnable(camera);
        if (postProcess.disablePostProcessForDebugView()) {
            enable = false;
        }
        return enable && this.setting.material != null;
    }

    name = 'GaussianBlurPass';
    outputNames = ['GaussianBlurMap'];

    public render (camera: renderer.scene.Camera, ppl: rendering.Pipeline): void {
        const setting = this.setting;
        if(!setting.material){
            return;
        }

        let passContext = this.context;
        passContext.material = setting.material;

        const cameraID = this.getCameraUniqueID(camera);
        const cameraName = `Camera${cameraID}`;
        const passViewport = passContext.passViewport;

        passContext.clearBlack();
        const format = Format.RGBA8;

        let input = this.lastPass!.slotName(camera, 0);
        for(let i = 0; i < setting.iterations; ++i){
            passContext
                .updatePassViewPort() //这个函数用来指定相对分辨率大小，这个根据算法需求来指定就行。如果要保持和后台缓冲区一样大，传入 1.0 即可。
                .addRenderPass(`blur-x`, `blur-x${cameraID}`) /* 这个函数用来告诉管线，需要执行一次绘制流程。layout：对应的是 Cocos Shader 中的 Pass 名称 ,passName：助记名称，便于调试查看 */
                .setPassInput(input, 'outputResultMap')
                /* setPassInput：如果有用到自定义管线中的 RT 资源（比如上一次执行的结果），则需要在这里指定，方便自定义管线对资源进行管理。
                    inputName: 自定义管线资源分配的资源名称
                    shaderName: 对应 Cocos Shader 中的 uniform Sampler2D 名称。 */
                .addRasterView('GaussianBlurMap_TMP', format)
              /*  addRasterView：可以简单理解为，输出结果
                  name：输出的 RT 名称，便于后续流程复用
                  format：输出的 RT 格式，比如，RGBA8888、RGBA16F 等等 */
                .blitScreen(0)
               /*  blitScreen：执行绘制
                passIdx：Cocos Shader 中的 Pass 索引（这个在后面的版本中会优化一下，到时候，后处理流程可以不用传这个值）。 */
                .version(); /* version：无实际意义，可以忽略。 */

            passContext
                .updatePassViewPort()
                .addRenderPass(`blur-y`, `blur-y${cameraID}`)
                .setPassInput('GaussianBlurMap_TMP', 'outputResultMap')
                .addRasterView(this.slotName(camera), format)
                .blitScreen(1)
                .version();
            input = this.slotName(camera);
        }
        
    }
}

/* 添加到管线 */
let builder = rendering.getCustomPipeline('Custom') as postProcess.PostProcessBuilder;
if (builder) {
    builder.insertPass(new GaussianBlurPass(),postProcess.BlitScreenPass);
}