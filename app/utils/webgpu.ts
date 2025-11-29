
import tgpu, { TgpuRoot, TgpuBuffer, TgpuBindGroup, TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';

// each are 32 bits
export const Params = d.struct({
  distortion: d.f32,
  scale: d.f32,
});

export type ParamsType = d.Infer<typeof Params>;

export const shaderCode = `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main_vert(@builtin(vertex_index) index: u32) -> VertexOutput {
  const vertices = array<vec2f, 4>(
    vec2f(-1.0, -1.0), // Bottom-left
    vec2f(-1.0,  1.0), // Top-left
    vec2f( 1.0, -1.0), // Bottom-right
    vec2f( 1.0,  1.0)  // Top-right
  );

  let pos = vertices[index];
  var output: VertexOutput;
  output.position = vec4f(pos, 0.0, 1.0);
  output.uv = vec2f((pos.x + 1.0) * 0.5, 1.0 - (pos.y + 1.0) * 0.5);
  return output;
}

@fragment
fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
  let k = params.distortion;
  let s = params.scale;
  
  // center coords
  let centered = uv - vec2f(0.5);
  
  // for scaling
  let scaled = centered / s;
  
  // squared distance from center
  let r2 = dot(scaled, scaled);
  
  // x' = x(1 + k*r^2)
  // stretched or compressed
  let factor = 1.0 + k * r2;
  let distorted_uv = scaled * factor + vec2f(0.5);
  
  // check bounds & return black
  if (distorted_uv.x < 0.0 || distorted_uv.x > 1.0 || distorted_uv.y < 0.0 || distorted_uv.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  
  // return final distorted video frame
  return textureSampleLevel(inTexture, inSampler, distorted_uv, 0.0);
}
`;

export interface WebGPUContext {
    root: TgpuRoot;
    device: GPUDevice;
    context: GPUCanvasContext;
    presentationFormat: GPUTextureFormat;
    videoTexture: TgpuTexture<any>;
    paramsBuffer: TgpuBuffer<typeof Params>;
    pipeline: GPURenderPipeline;
    bindGroup: TgpuBindGroup;
    videoWidth: number;
    videoHeight: number;
}

export async function initWebGPU(
    canvas: HTMLCanvasElement, 
    video: HTMLVideoElement, 
    width: number, 
    height: number
): Promise<WebGPUContext | null> {
    if (!navigator.gpu) {
        console.error("WebGPU not supported");
        return null;
    }

    const root = await tgpu.init();
    const device = root.device;
    
    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    
    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
    });

    const videoWidth = video.videoWidth || width;
    const videoHeight = video.videoHeight || height;

    // size of the texture & usage flags
    const videoTexture = root['~unstable'].createTexture({
        size: [videoWidth, videoHeight],
        format: 'rgba8unorm',
    }).$usage('sampled', 'render');

    // https://en.wikipedia.org/wiki/Bilinear_interpolation
    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });

    // buffer to hold the params
    const paramsBuffer = root.createBuffer(Params).$usage('uniform');
    paramsBuffer.write({ distortion: 0.0, scale: 1.0 });

    // declaring the resource layout
    const bindGroupLayout = tgpu.bindGroupLayout({
        inTexture: { texture: d.texture2d(d.f32) },
        inSampler: { sampler: 'filtering' },
        params: { uniform: Params },
    });

    // the values that will be passed to the shader
    const bindGroup = root.createBindGroup(bindGroupLayout, {
        inTexture: videoTexture.createView(d.texture2d(d.f32)),
        inSampler: sampler,
        params: paramsBuffer,
    });

    // compile shader to access texture, sampler, and uniform buffer
    const shaderModule = device.createShaderModule({
        code: tgpu.resolve({
            template: shaderCode,
            externals: {
                ...bindGroupLayout.bound,
            },
        }),
    });

    // video frame & uniform buffer
    //   -> vertex shader
    //   -> fragment shader
    //   -> rasterization
    //   -> run calculations
    //   -> distorted video frame
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [root.unwrap(bindGroupLayout)],
        }),
        vertex: {
            module: shaderModule,
            entryPoint: 'main_vert',
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'main_frag',
            targets: [{ format: presentationFormat }],
        },
        primitive: {
            topology: 'triangle-strip',
        },
    });

    return {
        root,
        device,
        context,
        presentationFormat,
        videoTexture,
        paramsBuffer,
        pipeline,
        bindGroup,
        videoWidth,
        videoHeight
    };
}

export function drawFrame(ctx: WebGPUContext, video: HTMLVideoElement) {
    const { 
        root, device, context, videoTexture, 
        pipeline, bindGroup, videoWidth, videoHeight 
    } = ctx;

    // copy the video frame to the texture
    if (video.readyState >= 2) {
        device.queue.copyExternalImageToTexture(
            { source: video },
            { texture: root.unwrap(videoTexture) },
            [videoWidth, videoHeight]
        );
    }

    // create a command encoder (in a batch)
    const encoder = device.createCommandEncoder();
    // begin a render pass
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear', // clear canvas before drawing
            clearValue: [0, 0, 0, 1], // black
            storeOp: 'store', // rendered pixels in texture
        }],
    });

    pass.setPipeline(pipeline);
    // provide texture, sampler, and uniform buffer to the shader
    pass.setBindGroup(0, root.unwrap(bindGroup));
    pass.draw(4); // draw 4 vertices
    pass.end(); // no more render commands

    device.queue.submit([encoder.finish()]); // submit command buffer to the GPU
}

