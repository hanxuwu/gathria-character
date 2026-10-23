"""Clothing-only curved sampling. Source anatomy and registered anchors stay fixed."""
import numpy as np
from scipy import ndimage as nd
import cv2

def painted_elbow(patch,owned,points,limbs,donor,reference_points,reference_limbs):
    """Pose-dependent supplemental cloth, restricted to existing sleeve ownership.

    The generated portrait contributes only navy cloth from two traced source
    arm regions. The unchanged source masks determine contour and occlusion.
    A continuous bend weight avoids switching drawings at a frame-number cutoff.
    """
    out=patch.copy();yy,xx=np.indices(owned.shape,dtype=np.float32)
    for side in ['far','near']:
        names=[side+s for s in ['Shoulder','Elbow','Wrist']]
        target=np.asarray([[points[n]['x'],points[n]['y']] for n in names],np.float32)
        a,b,c=target;u=b-a;v=c-b
        cosine=float(u@v)/max(float(np.linalg.norm(u)*np.linalg.norm(v)),1)
        strength=float(np.clip((.45-cosine)/1.15,0,1));strength=strength*strength*(3-2*strength)
        if strength<.001:continue
        source=np.asarray([[reference_points[n]['x'],reference_points[n]['y']] for n in names],np.float32)
        inverse=cv2.getAffineTransform(target,source)
        sx=inverse[0,0]*xx+inverse[0,1]*yy+inverse[0,2];sy=inverse[1,0]*xx+inverse[1,1]*yy+inverse[1,2]
        rgb=donor[:,:,:3].astype(float)
        valid=reference_limbs[side+'Arm']&(rgb[:,:,2]>rgb[:,:,0]+6)&(rgb[:,:,2]<150)
        valid=nd.binary_erosion(valid,iterations=2)
        if valid.sum()<100:raise ValueError('Missing supplementary navy sleeve material')
        nearest=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True)
        cloth=rgb[tuple(nearest)]
        sampled=np.stack([nd.map_coordinates(cloth[:,:,i],[sy,sx],order=1,mode='nearest') for i in range(3)],axis=2)
        region=owned&limbs[side+'Arm']
        # Keep the actual drawn cuff and outside ink; only the inside sleeve
        # gains the new folds. Shoulder/torso joins fade over a short overlap.
        distance=nd.distance_transform_edt(region)
        wrist_distance=np.hypot(xx-c[0],yy-c[1])
        shoulder_distance=np.hypot(xx-a[0],yy-a[1])
        weight=strength*np.clip((distance-2)/7,0,1)*np.clip((wrist_distance-20)/16,0,1)*np.clip(shoulder_distance/30,0,1)
        out[region,:3]=np.rint(patch[region,:3]*(1-weight[region,None])+sampled[region]*weight[region,None]).astype(np.uint8)
    return out

def round_skirt_sides(patch,points,preserve_ink):
    """Small outward cloth allowance, zero at waist and painted hem.

    Crouching amplifies a straight cone into a sharp triangle. Give each side
    a shallow continuous bow while retaining interior folds and hem scallops.
    Foreground body/hand protection is applied by the original fitter after this.
    """
    yy,xx=np.indices(patch.shape[:2]);solid=patch[:,:,3]>8
    rows=solid.any(axis=1)
    if not rows.any():return patch
    waist=(points['waistLeft']['y']+points['waistRight']['y'])/2
    hem=float(np.where(rows)[0].max());length=max(1,hem-waist)
    progress=np.clip((np.arange(len(rows))-waist)/length,0,1)
    # No oscillation or action-specific phase is introduced: source pose alone
    # determines the same bounded allowance on repeat and mirrored playback.
    compression=np.clip((210-length)/110,0,1)
    allowance=(6+6*compression)*np.sin(np.pi*progress)**2
    allowance[~rows]=0
    left=np.where(solid,xx,patch.shape[1]).min(axis=1).astype(float)
    right=np.where(solid,xx,-1).max(axis=1).astype(float)
    sample_x=xx.astype(float);band=24
    for edge,extra,sign in [(left,allowance,1),(right,allowance,-1)]:
        target=edge-sign*extra;distance=(xx-target[:,None])*sign
        mapped=edge[:,None]+sign*distance*band/(band+extra[:,None])
        region=rows[:,None]&(extra[:,None]>.01)&(distance<band+extra[:,None])
        sample_x=np.where(region,mapped,sample_x)
    alpha=patch[:,:,3].astype(float)/255
    out_alpha=nd.map_coordinates(alpha,[yy,sample_x],order=1,mode='constant',cval=0)
    out=np.zeros_like(patch)
    for c in range(3):
        rgb=nd.map_coordinates(patch[:,:,c]*alpha,[yy,sample_x],order=1,mode='constant',cval=0)
        out[:,:,c]=np.clip(np.rint(np.divide(rgb,out_alpha,out=np.zeros_like(rgb),where=out_alpha>1e-6)),0,255).astype(np.uint8)
    out[:,:,3]=np.rint(out_alpha*255).astype(np.uint8)
    return preserve_ink(patch,out,left,right,allowance,allowance,band)
