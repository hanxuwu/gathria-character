"""Recover existing painted hem contours; no replacement body artwork."""
import numpy as np
from scipy import ndimage as ndi


def recover_painted_hem(rgb, previous, ivory):
    """Trace dark hem ink inside a narrow original-art window.

    The V1–V3 colour mask rejected dark edge ink and some warm fabric shadows.
    A horizontally continuous dark-ink path recovers the original donor hem;
    it is constrained to the already traced outline so leg contours below the
    skirt cannot become the new silhouette. RGB remains exact donor artwork.
    Only the lower donor band is changed; hidden-hand completion above remains.
    """
    result = previous.copy()
    opaque = previous[:,:,3] > 127
    h,w=opaque.shape; yy,xx=np.indices(opaque.shape)
    # The hand-traced source outline, before colour rejection, is supplied by
    # the narrow reviewed hem path below. Coordinates are in outfit-designs.png.
    if ivory:
        anchors=[(572,1360),(580,1376),(592,1382),(603,1401),(617,1408),(632,1405),(646,1412),(660,1417),(674,1410),(687,1419),(704,1421),(719,1420),(736,1425),(752,1423),(768,1421),(781,1428),(798,1426),(813,1421),(827,1423),(841,1420),(855,1415),(872,1416),(887,1409),(902,1403),(919,1402),(933,1392),(949,1380)]
        start=1352; search=10; border=1.2
    else:
        anchors=[(122,1343),(130,1349),(145,1357),(155,1362),(162,1369),(177,1375),(192,1379),(207,1381),(220,1383),(230,1383),(236,1380),(246,1380),(260,1384),(275,1387),(287,1386),(301,1383),(313,1381),(326,1382),(342,1384),(356,1384),(370,1381),(382,1376),(390,1367),(402,1363),(415,1363),(430,1359),(443,1348)]
        start=1340; search=7; border=1.2
    ax,ay=np.array(anchors,dtype=float).T
    xs=np.arange(int(ax[0]),int(ax[-1])+1); expected=np.interp(xs,ax,ay)
    low=int(np.floor(expected.min()-search)); high=int(np.ceil(expected.max()+search))+1
    ys=np.arange(low,high); lum=(rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722)
    cost=ndi.gaussian_filter(lum.astype(float),(.4,.65))[ys[:,None],xs[None,:]]
    # Colour rewards the existing dark ink. Distance penalty prevents selecting
    # a nearby leg outline or inner fold where the mask was formerly jagged.
    cost += .9*(ys[:,None]-expected[None,:])**2
    cost[np.abs(ys[:,None]-expected[None,:])>search]=1e6
    accum=cost[:,0].copy();parents=np.zeros(cost.shape,dtype=np.int16)
    for j in range(1,len(xs)):
        options=np.full((9,len(ys)),1e9)
        for q,delta in enumerate(range(-4,5)):
            old=np.arange(len(ys))+delta; valid=(old>=0)&(old<len(ys))
            options[q,valid]=accum[old[valid]]+2.5*abs(delta)
        choices=options.argmin(axis=0)
        parents[:,j]=np.arange(len(ys))+choices-4
        accum=cost[:,j]+options[choices,np.arange(len(ys))]
    path=np.zeros(len(xs));idx=int(accum.argmin())
    for j in range(len(xs)-1,-1,-1):
        path[j]=ys[idx]
        if j:idx=int(parents[idx,j])
    # Subpixel edge lies just outside the ink centre. Keep the donor's painted
    # scallops; do not apply a broad geometric blur to the target silhouette.
    path=ndi.gaussian_filter1d(path,.55)+border
    if ivory:
        # Lace's white border is a stronger boundary cue than dark ink next to
        # the reference legs. Follow the last actual white-cloth pixel inside
        # the previously reviewed cutout, then retain only its thin ink edge.
        r,g,b=[rgb[:,:,i].astype(float) for i in range(3)]
        fabric=(r>220)&(g>210)&(b>195)&(r-g<30)&(g-b<35)&opaque&(yy>=start)
        last=np.max(np.where(fabric,yy,-1),axis=0)[xs].astype(float)
        good=last>=start
        last=np.interp(xs,xs[good],last[good])
        # Keep the immediately adjacent dark source outline, but stop before
        # neutral backdrop or warm leg pixels. This is a donor-local boundary
        # trace, never a global colour deletion from the composed character.
        edge=last+1.0
        for delta in range(1,6):
            sample_y=np.clip(np.rint(last).astype(int)+delta,0,h-1)
            colors=rgb[sample_y,xs]
            ink=(colors.max(axis=1)<150)&(colors.min(axis=1)<90)
            edge=np.where(ink,last+delta+.35,edge)
        path=ndi.gaussian_filter1d(edge,.5)
    rows=np.arange(h)[:,None]
    bottom=np.clip(path[None,:]+.5-rows,0,1)
    for j,x in enumerate(xs):
        valid_y=np.flatnonzero(opaque[:,x])
        if not len(valid_y):continue
        begin=max(start,int(valid_y[0]))
        result[begin:,x,3]=np.round(bottom[begin:,j]*255).astype(np.uint8)
        result[begin:,x,:3]=rgb[begin:,x]
    # Remove faint mask-resampling rings; opaque contours and source pixels
    # remain represented at full native resolution.
    result[result[:,:,3]<=4]=0
    return result
